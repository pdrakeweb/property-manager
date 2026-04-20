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
  type HostMetadataStore,
  type IndexRecord,
  type StorageAdapter,
  type SyncResult,
  type VaultRegistry,
} from './types'
import type { LocalIndex } from './localIndex'

export interface SyncEngineContext {
  storage: StorageAdapter
  localIndex: LocalIndex
  registry: VaultRegistry
  host: HostMetadataStore
  audit: AuditLogger
}

/** Field-by-field comparison — returns the keys where both sides have non-null, differing values. */
export function overlappingMutations(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  const overlapping: string[] = []
  for (const k of keys) {
    const l = local[k]
    const r = remote[k]
    if (l != null && r != null && JSON.stringify(l) !== JSON.stringify(r)) {
      overlapping.push(k)
    }
  }
  return overlapping
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
  const pending = ctx.localIndex.getPending()
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

async function resolveConflict(
  ctx:      SyncEngineContext,
  record:   IndexRecord,
  conflict: ETagConflictError,
): Promise<void> {
  let remoteRecord: IndexRecord
  try {
    remoteRecord = JSON.parse(conflict.latestContent) as IndexRecord
  } catch {
    remoteRecord = { ...record, data: {} }
  }

  const localData  = record.data as Record<string, unknown>
  const remoteData = remoteRecord.data as Record<string, unknown>
  const overlap    = overlappingMutations(localData, remoteData)

  const { filename, rootFolderId, categoryId } = record.data as {
    filename: string; rootFolderId: string; categoryId: string
  }

  if (overlap.length === 0) {
    const mergedRecord: IndexRecord = {
      ...remoteRecord,
      ...record,
      data: { ...remoteData, ...localData },
    }
    try {
      const folderId   = await resolveRecordFolder(ctx, record, categoryId, rootFolderId)
      const mergedFile = await ctx.storage.uploadFile(
        folderId, filename, JSON.stringify(mergedRecord), 'application/json',
        conflict.latestEtag,
      )
      ctx.localIndex.markSynced(record.id, mergedFile.id, new Date().toISOString(), mergedFile.etag)
      ctx.audit.info('sync.conflict', `Auto-merged: ${record.title}`, record.propertyId)
    } catch {
      /* merge upload failed — leave pending for retry */
    }
    return
  }

  // True conflict — write a v2 copy and flag the original.
  const ts     = Date.now()
  const v2Name = filename.replace(/\.json$/, '') + `_v2_${ts}.json`
  const v2Id   = `conflict_v2_${record.id}_${ts}`

  try {
    const v2Record: IndexRecord = {
      ...record,
      id:    v2Id,
      title: record.title + ' (v2)',
    }
    const folderId = await resolveRecordFolder(ctx, record, categoryId, rootFolderId)
    const v2File   = await ctx.storage.uploadFile(
      folderId, v2Name, JSON.stringify(v2Record), 'application/json',
    )

    ctx.localIndex.upsert({
      ...v2Record,
      syncState:      'synced',
      driveFileId:    v2File.id,
      driveEtag:      v2File.etag,
      conflictWithId: record.id,
      driveUpdatedAt: new Date().toISOString(),
    })
  } catch {
    /* v2 upload failed — still mark original as conflict */
  }

  const existing = ctx.localIndex.getById(record.id)
  if (existing) {
    ctx.localIndex.upsert({
      ...existing,
      syncState:      'conflict',
      conflictWithId: v2Id,
    })
  }
  ctx.audit.warn(
    'sync.conflict',
    `Conflict: ${record.title} saved as v2 (fields: ${overlap.join(', ')})`,
    record.propertyId,
  )
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
): Promise<{ pulled: number; failed: number }> {
  const rootFolderId = ctx.host.getRootFolderId(propertyId)
  if (!rootFolderId) return { pulled: 0, failed: 0 }

  const knownDriveIds = new Set(
    ctx.localIndex.getAllForProperty(propertyId)
      .map(r => r.driveFileId)
      .filter(Boolean) as string[],
  )

  let pulled = 0
  let failed = 0

  for (const folderName of allFolderNames(ctx)) {
    try {
      const folderId = await ctx.storage.resolveFolderId(folderName, rootFolderId)
      const files    = await ctx.storage.listFiles(folderId)

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        if (knownDriveIds.has(file.id))   continue

        try {
          const fileData = await ctx.storage.downloadFile(file.id)
          const stored   = JSON.parse(fileData.content) as IndexRecord

          ctx.localIndex.upsert({
            ...stored,
            propertyId,
            syncState:      'synced',
            driveFileId:    file.id,
            driveEtag:      fileData.etag,
            driveUpdatedAt: new Date().toISOString(),
          }, 'remote')
          knownDriveIds.add(file.id)
          pulled++
        } catch {
          failed++
        }
      }
    } catch {
      failed++
    }
  }

  if (pulled > 0 || failed > 0) {
    const msg = `Pulled ${pulled} record${pulled !== 1 ? 's' : ''}` + (failed > 0 ? `, ${failed} failed` : '')
    ctx.audit.info('sync.pull', msg, propertyId)
  }

  return { pulled, failed }
}

// ─── Full sync ───────────────────────────────────────────────────────────────

export async function syncAll(ctx: SyncEngineContext, propertyId: string): Promise<SyncResult> {
  const { pulled, failed: pullFailed } = await pullFromDrive(ctx, propertyId)
  const { uploaded, failed: uploadFailed, errors: uploadErrors } = await pushPending(ctx)

  const summary = `Sync complete: ↑${uploaded} uploaded ↓${pulled} pulled` +
    (uploadFailed + pullFailed > 0 ? ` · ${uploadFailed + pullFailed} errors` : '')
  ctx.audit.info('sync', summary, propertyId)

  return { uploaded, uploadFailed, uploadErrors, pulled, pullFailed }
}
