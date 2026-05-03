/**
 * Vault sync engine — push/pull/conflict resolution against any StorageAdapter.
 *
 * Extracted from `src/lib/syncEngine.ts`. The key differences from the legacy
 * module are:
 *  - Takes a `VaultContext` instead of importing `propertyStore` / `DriveClient`.
 *  - Uses a `VaultRegistry` to enumerate folders during pull (no more
 *    hardcoded `CATEGORY_FOLDER_NAMES` scan).
 *  - Special-cased `propertyStore` flow is gone; the host app layer handles
 *    the property-config JSON itself (it's not a regular record).
 */

import {
  ETagConflictError,
  type AuditLogger,
  type ConflictField,
  type HostMetadataStore,
  type IndexRecord,
  type StorageAdapter,
  type SyncResult,
  type VaultRegistry,
} from './types'
import type { LocalIndex } from './localIndex'
import { mergeRecords } from './mergeRecord'
import { merge as mergeClocks, ensureVClock } from './vclock'

export interface SyncEngineContext {
  storage: StorageAdapter
  localIndex: LocalIndex
  registry: VaultRegistry
  host: HostMetadataStore
  audit: AuditLogger
  /** This device's id — used as the actor on CRDT vector-clock writes
   *  performed by the sync engine itself (e.g. merge writes during pull). */
  deviceId: string
}

// ─── Folder resolution ───────────────────────────────────────────────────────

/**
 * Resolve the storage folder for a record, honoring the registry's
 * variant-aware folder-name resolution. Falls back to the raw category id
 * (or the legacy folder map) when the type is unknown to the DSL registry.
 */
async function resolveRecordFolder(
  ctx:         SyncEngineContext,
  record:      IndexRecord,
  categoryId:  string,
  rootFolderId:string,
): Promise<string> {
  const info = ctx.registry.get(record.type)
  let folderName: string

  if (info) {
    folderName = info.resolveFolderName(record.data)
  } else {
    folderName = ctx.registry.legacyFolderNames()[categoryId] ?? categoryId
  }

  return ctx.storage.resolveFolderId(folderName, rootFolderId)
}

// ─── Push ────────────────────────────────────────────────────────────────────

export async function pushPending(
  ctx: SyncEngineContext,
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  // Live records that need (re)upload + tombstones (deletes that need to
  // propagate to peers). Tombstones serialize as the same JSON shape but
  // carry `syncState: 'deleted'` and a `deletedAt` timestamp — peers see
  // these on pull and refuse to resurrect.
  const pending = [...ctx.localIndex.getPending(), ...ctx.localIndex.getPendingTombstones()]
  let uploaded = 0
  const errors: string[] = []

  for (const record of pending) {
    const d = record.data as Record<string, unknown>

    const rawFilename  = (d.filename as string) || ''
    const filename     = rawFilename && !rawFilename.endsWith('.md') ? rawFilename : `${record.type}_${record.id}.json`
    const categoryId   = (d.categoryId   as string) || record.categoryId || record.type
    const rootFolderId = (d.rootFolderId as string) || ctx.host.getRootFolderId(record.propertyId) || ''

    if (!rootFolderId) continue  // Property has no configured root — skip silently

    // Heal missing Drive metadata on the record so subsequent runs skip this derivation.
    if (!d.filename || !d.categoryId || !d.rootFolderId) {
      ctx.localIndex.upsert({ ...record, data: { ...d, filename, categoryId, rootFolderId } })
    }

    const content = JSON.stringify({ ...record, data: { ...d, filename, categoryId, rootFolderId } })

    try {
      const folderId = await resolveRecordFolder(ctx, record, categoryId, rootFolderId)
      const file = await ctx.storage.uploadFile(
        folderId, filename, content, 'application/json',
        record.driveEtag,
      )
      ctx.localIndex.markSynced(record.id, file.id, new Date().toISOString(), file.etag)
      uploaded++
    } catch (err) {
      if (!(err instanceof ETagConflictError)) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${record.title}: ${msg}`)
        ctx.audit.error('sync.upload', `Upload failed: ${record.title} — ${msg}`, record.propertyId)
        continue
      }
      await resolveConflict(ctx, record, err)
    }
  }

  return { uploaded, failed: errors.length, errors }
}

/**
 * ETag conflict during push → vclock-aware merge.
 *
 * The remote file moved between our last pull and our push attempt. Run the
 * same three-way merge `pullFromDrive` uses:
 *  - if remote dominates, treat it as a fresh pull (drive wins; user's local
 *    edit was based on a stale clock and is now superseded — surfaced as a
 *    `'conflict'` state so the user can re-apply if desired);
 *  - if local dominates (already-applied remote write), retry the upload with
 *    the new etag so the push wins;
 *  - if equal, just refresh our etag — content is identical;
 *  - if concurrent, store conflict fields locally and let the user resolve.
 *
 * The legacy `_v2_<ts>.json` file split is gone — the vclock IS the conflict
 * signal. Conflicts are resolved in-place via the local index, not by
 * generating sibling files in Drive.
 */
async function resolveConflict(
  ctx:      SyncEngineContext,
  record:   IndexRecord,
  conflict: ETagConflictError,
): Promise<void> {
  let remoteRecord: IndexRecord
  try {
    remoteRecord = JSON.parse(conflict.latestContent) as IndexRecord
  } catch {
    // Remote payload unparseable — treat the local edit as the truth and
    // force-upload it (without the if-match header) so we don't loop.
    await forceUploadLocal(ctx, record, conflict.fileId, conflict.latestEtag)
    return
  }

  const outcome = mergeRecords(record, remoteRecord, ctx.deviceId)

  if (outcome.kind === 'equal') {
    ctx.localIndex.markSynced(record.id, conflict.fileId, new Date().toISOString(), conflict.latestEtag)
    return
  }

  if (outcome.kind === 'drive-wins') {
    // The user's local edit is causally older than what's already on Drive.
    // Surface it as a conflict carrying the remote field values so the user
    // can re-apply selectively.
    const conflictFields: ConflictField[] = []
    const localData  = (record.data as Record<string, unknown>) ?? {}
    const remoteData = (remoteRecord.data as Record<string, unknown>) ?? {}
    for (const k of new Set([...Object.keys(localData), ...Object.keys(remoteData)])) {
      if (k === 'filename' || k === 'rootFolderId' || k === 'categoryId') continue
      if (JSON.stringify(localData[k]) === JSON.stringify(remoteData[k])) continue
      conflictFields.push({ path: k, local: localData[k], remote: remoteData[k] })
    }
    ctx.localIndex.upsert({
      ...remoteRecord,
      propertyId:     record.propertyId,
      syncState:      conflictFields.length > 0 ? 'conflict' : 'synced',
      conflictReason: conflictFields.length > 0
        ? `Remote moved ahead while you were editing: ${conflictFields.map(f => f.path).join(', ')}`
        : undefined,
      conflictFields: conflictFields.length > 0 ? conflictFields : undefined,
      driveFileId:    conflict.fileId,
      driveEtag:      conflict.latestEtag,
      driveUpdatedAt: new Date().toISOString(),
      vclock:         mergeClocks(record.vclock, remoteRecord.vclock),
    }, 'remote')
    ctx.audit.warn('sync.conflict', `Drive moved ahead: ${record.title}`, record.propertyId)
    return
  }

  if (outcome.kind === 'local-wins') {
    // Local supersedes remote — re-upload with the new etag.
    await forceUploadLocal(ctx, record, conflict.fileId, conflict.latestEtag)
    return
  }

  // Concurrent — write the merged record back to Drive and surface the
  // field-level diff for user resolution. The merged file uploads with the
  // OR'd vclock so any subsequent device sees both lineages.
  const merged: IndexRecord = {
    ...record,
    syncState:      'conflict',
    conflictReason: `Concurrent edits on ${outcome.conflictFields.length} field${outcome.conflictFields.length === 1 ? '' : 's'}`,
    conflictFields: outcome.conflictFields,
    vclock:         outcome.mergedClock,
  }
  await forceUploadLocal(ctx, merged, conflict.fileId, conflict.latestEtag)
  ctx.audit.warn(
    'sync.conflict',
    `Concurrent edit on ${record.title}: ${outcome.conflictFields.map(f => f.path).join(', ')}`,
    record.propertyId,
  )
}

/** Re-upload `record` to Drive with `if-match: latestEtag`. On success,
 *  reflect the new etag in the local index. The `fileId` arg is reserved
 *  for adapters that key uploads off the file id rather than folder+name —
 *  unused today but retained so the call sites read symmetrically. */
async function forceUploadLocal(
  ctx: SyncEngineContext,
  record: IndexRecord,
  _fileId: string,
  ifMatchEtag: string,
): Promise<void> {
  const d = record.data as Record<string, unknown>
  const filename     = (d.filename     as string) || `${record.type}_${record.id}.json`
  const categoryId   = (d.categoryId   as string) || record.categoryId || record.type
  const rootFolderId = (d.rootFolderId as string) || ctx.host.getRootFolderId(record.propertyId) || ''
  if (!rootFolderId) return

  try {
    const folderId = await resolveRecordFolder(ctx, record, categoryId, rootFolderId)
    const file = await ctx.storage.uploadFile(
      folderId, filename, JSON.stringify(record), 'application/json',
      ifMatchEtag,
    )
    // For records that are now in conflict state, preserve the conflict
    // markers on the local index — markSynced would clobber them. Use
    // upsert (remote-source) so the vclock isn't bumped again.
    if (record.syncState === 'conflict') {
      ctx.localIndex.upsert({
        ...record,
        driveFileId:    file.id,
        driveEtag:      file.etag,
        driveUpdatedAt: new Date().toISOString(),
      }, 'remote')
    } else {
      ctx.localIndex.markSynced(record.id, file.id, new Date().toISOString(), file.etag)
    }
  } catch {
    // Re-upload failed — leave the record pending for next sync. The next
    // pass will re-pull, re-merge, and try again. (Loop terminates because
    // each successful merge advances the local clock; eventually local
    // strictly dominates the still-stale remote.)
  }
}

// ─── Pull ────────────────────────────────────────────────────────────────────

/**
 * Collect every folder name known to the vault — DSL-registered types plus
 * legacy category folders the app still uses. Duplicates are fine; the
 * adapter's `resolveFolderId` is idempotent.
 */
function allFolderNames(ctx: SyncEngineContext): string[] {
  const names = new Set<string>()
  for (const type of ctx.registry.allTypes()) {
    const info = ctx.registry.get(type)
    if (info) names.add(info.folderName)
  }
  for (const name of Object.values(ctx.registry.legacyFolderNames())) {
    names.add(name)
  }
  return [...names]
}

export async function pullFromDrive(
  ctx:        SyncEngineContext,
  propertyId: string,
): Promise<{ pulled: number; failed: number; conflicts: number }> {
  const rootFolderId = ctx.host.getRootFolderId(propertyId)
  if (!rootFolderId) return { pulled: 0, failed: 0, conflicts: 0 }

  // Index local records by driveFileId for vclock-aware merge. Anything
  // without a driveFileId is local-only — the file we're about to read can't
  // be its remote counterpart, so it's left alone.
  const byDriveId = new Map<string, IndexRecord>()
  for (const r of ctx.localIndex.getAllForProperty(propertyId)) {
    if (r.driveFileId) byDriveId.set(r.driveFileId, r)
  }
  // Tombstones too — `getAllForProperty` filters them out, but we need them
  // here so an incoming non-deleted record we've locally tombstoned can be
  // refused (resurrection protection).
  for (const r of ctx.localIndex.getAllTombstones()) {
    if (r.propertyId === propertyId && r.driveFileId) byDriveId.set(r.driveFileId, r)
  }

  let pulled = 0
  let failed = 0
  let conflicts = 0

  for (const folderName of allFolderNames(ctx)) {
    try {
      const folderId = await ctx.storage.resolveFolderId(folderName, rootFolderId)
      const files    = await ctx.storage.listFiles(folderId)

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue

        // Short-circuit: if the local etag matches the remote etag we already
        // have this exact byte-for-byte file. Saves a download round-trip.
        const local = byDriveId.get(file.id)
        if (local?.driveEtag && local.driveEtag === (file as { etag?: string }).etag) {
          continue
        }

        try {
          const fileData = await ctx.storage.downloadFile(file.id)
          const remote   = JSON.parse(fileData.content) as IndexRecord

          // Schema validation against the registered Zod schema (if any).
          // An invalid remote payload is still stored locally — but flagged
          // as a conflict with a human-readable reason so the resolver UI
          // can surface it. Validation runs BEFORE vclock comparison: a
          // garbled remote should never silently win on vclock alone.
          const typeInfo   = ctx.registry.get(remote.type)
          const validation = typeInfo?.validate?.(remote.data)
          if (validation && !validation.ok) {
            const reason = `Invalid data from remote: ${validation.errors.slice(0, 5).join('; ')}`
            ctx.audit.warn('sync.validation', reason, propertyId)
            ctx.localIndex.upsert({
              ...(local ?? remote),
              ...remote,
              propertyId,
              syncState:      'conflict',
              conflictReason: reason,
              driveFileId:    file.id,
              driveEtag:      fileData.etag,
              driveUpdatedAt: new Date().toISOString(),
              vclock:         mergeClocks(local?.vclock, remote.vclock),
            }, 'remote')
            conflicts++
            continue
          }

          // No prior local copy → first-time pull, drive wins by default.
          // If the incoming record is a tombstone, mirror it locally so we
          // don't accidentally "discover" a deleted record as if it were live.
          if (!local) {
            const adoptingTombstone = !!remote.deletedAt
            ctx.localIndex.upsert({
              ...remote,
              propertyId,
              syncState:      adoptingTombstone ? 'deleted' : 'synced',
              conflictReason: undefined,
              driveFileId:    file.id,
              driveEtag:      fileData.etag,
              driveUpdatedAt: new Date().toISOString(),
              vclock:         ensureVClock(remote.vclock, ctx.deviceId),
            }, 'remote')
            if (!adoptingTombstone) pulled++
            continue
          }

          // Resurrection protection. If local has a tombstone and remote is
          // a live record, vclock arbitrates: tombstone-wins keeps the delete
          // (don't resurrect); remote-wins lets the un-delete through (a
          // peer un-deleted by writing on top of a stale clock — rare but
          // legitimate). The mergeRecords call below handles both cases.
          //
          // Likewise if remote is itself a tombstone and we have a live
          // record: vclock decides whether to apply the delete.

          // Vclock-aware three-way merge against the existing local copy.
          const outcome = mergeRecords(local, remote, ctx.deviceId)

          if (outcome.kind === 'equal') {
            // Same causal state — just refresh the etag so subsequent pulls
            // can short-circuit on the etag match above.
            ctx.localIndex.upsert({
              ...local,
              driveEtag:      fileData.etag,
              driveUpdatedAt: new Date().toISOString(),
            }, 'remote')
            continue
          }

          if (outcome.kind === 'local-wins') {
            // Local has newer causal knowledge — push will sync it back.
            // Refresh the etag so we don't keep re-downloading the stale
            // remote, and reset syncState so push picks the record up:
            // tombstones go back to 'deleted' (handled by
            // getPendingTombstones); live records to 'pending_upload'.
            //
            // Do NOT touch driveUpdatedAt for tombstones — `getPendingTombstones`
            // uses `driveUpdatedAt < deletedAt` to detect "needs re-push", and
            // we still need to push this delete to Drive.
            ctx.localIndex.upsert({
              ...local,
              driveEtag:      fileData.etag,
              ...(local.deletedAt ? {} : { driveUpdatedAt: new Date().toISOString() }),
              syncState:      local.deletedAt ? 'deleted' : 'pending_upload',
            }, 'remote')
            continue
          }

          if (outcome.kind === 'drive-wins') {
            // Remote dominates — adopt it, with the merged clock. Clear any
            // stale conflictReason / conflictFields from a prior bad pull.
            // If remote is itself a tombstone, mirror that into the local
            // state machine; otherwise mark synced (which will resurrect
            // any prior local tombstone — the un-delete had a higher clock,
            // so this is the user's intent).
            const adoptingTombstone = !!remote.deletedAt
            ctx.localIndex.upsert({
              ...remote,
              propertyId,
              syncState:      adoptingTombstone ? 'deleted' : 'synced',
              conflictReason: undefined,
              conflictFields: undefined,
              driveFileId:    file.id,
              driveEtag:      fileData.etag,
              driveUpdatedAt: new Date().toISOString(),
              vclock:         mergeClocks(local.vclock, remote.vclock),
            }, 'remote')
            pulled++
            continue
          }

          // Concurrent — store the diff for the resolver UI. We keep LOCAL
          // data (so the user doesn't lose their in-flight edit) but mark
          // conflict and stash the remote field values for "Keep theirs".
          ctx.localIndex.upsert({
            ...local,
            propertyId,
            syncState:      'conflict',
            conflictReason: `Concurrent edits on ${outcome.conflictFields.length} field${outcome.conflictFields.length === 1 ? '' : 's'}`,
            conflictFields: outcome.conflictFields,
            driveFileId:    file.id,
            driveEtag:      fileData.etag,
            driveUpdatedAt: new Date().toISOString(),
            vclock:         outcome.mergedClock,
          }, 'remote')
          conflicts++
          ctx.audit.warn(
            'sync.conflict',
            `Concurrent edit on ${remote.title}: ${outcome.conflictFields.map(f => f.path).join(', ')}`,
            propertyId,
          )
        } catch {
          failed++
        }
      }
    } catch {
      failed++
    }
  }

  if (pulled > 0 || failed > 0 || conflicts > 0) {
    const parts = [`pulled ${pulled}`]
    if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts === 1 ? '' : 's'}`)
    if (failed > 0)    parts.push(`${failed} failed`)
    ctx.audit.info('sync.pull', parts.join(', '), propertyId)
  }

  return { pulled, failed, conflicts }
}

// ─── Full sync ───────────────────────────────────────────────────────────────

export async function syncAll(ctx: SyncEngineContext, propertyId: string): Promise<SyncResult> {
  const { pulled, failed: pullFailed, conflicts: pullConflicts } = await pullFromDrive(ctx, propertyId)
  const { uploaded, failed: uploadFailed, errors: uploadErrors } = await pushPending(ctx)

  const errCount = uploadFailed + pullFailed
  const summary = `Sync complete: ↑${uploaded} uploaded ↓${pulled} pulled` +
    (pullConflicts > 0 ? ` · ${pullConflicts} conflict${pullConflicts === 1 ? '' : 's'}` : '') +
    (errCount > 0 ? ` · ${errCount} errors` : '')
  ctx.audit.info('sync', summary, propertyId)

  return { uploaded, uploadFailed, uploadErrors, pulled, pullFailed, pullConflicts }
}
