import { DriveClient, ETagConflictError, CATEGORY_FOLDER_NAMES } from './driveClient'
import { localDriveAdapter } from './localDriveAdapter'
import { localIndex } from './localIndex'
import type { IndexRecord, IndexRecordType } from './localIndex'
import { propertyStore } from './propertyStore'
import { auditLog } from './auditLog'
import { syncBus } from './syncBus'
import type { LogEntry } from './auditLog'
import type { MaintenanceTask } from '../types'

const CHANGES_TOKEN_KEY = 'pm_drive_changes_token'

/** Returns the real DriveClient in production, or the localStorage adapter in dev bypass mode */
function drive(): typeof DriveClient {
  const token = localStorage.getItem('google_access_token')
  return token === 'dev_token'
    ? (localDriveAdapter as typeof DriveClient)
    : DriveClient
}

export interface SyncResult {
  uploaded: number
  uploadFailed: number
  uploadErrors: string[]
  pulled: number
  pullFailed: number
}

// ── Conflict helpers ──────────────────────────────────────────────────────────

/**
 * Compare two data objects field by field.
 * Returns the set of keys where both sides have a non-null value that differs.
 */
function overlappingMutations(
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

// ── Push ─────────────────────────────────────────────────────────────────────

/**
 * Upload all pending_upload records to Drive as JSON (full IndexRecord).
 *
 * Per record:
 *  - New file (no driveEtag): upload without If-Match
 *  - Existing file (has driveEtag): upload with If-Match
 *  - 412 / ETagConflictError → auto-merge if no field overlap, else surface conflict
 */
export async function pushPending(token: string): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  const pending = localIndex.getPending()
  let uploaded = 0
  const errors: string[] = []

  for (const record of pending) {
    const d = record.data as Record<string, unknown>

    // Heal missing Drive metadata from the IndexRecord itself.
    // If filename is a .md (equipment form legacy), use .json so pullFromDrive can restore it.
    const rawFilename  = (d.filename as string) || ''
    const filename     = rawFilename && !rawFilename.endsWith('.md') ? rawFilename : `${record.type}_${record.id}.json`
    const categoryId   = (d.categoryId   as string) || record.categoryId || record.type
    const property     = propertyStore.getById(record.propertyId)
    const rootFolderId = (d.rootFolderId as string) || property?.driveRootFolderId || ''

    if (!rootFolderId) continue  // Property has no Drive root — silently skip, not an error

    // If we healed any fields, persist them so future runs don't need to re-derive
    if (!d.filename || !d.categoryId || !d.rootFolderId) {
      localIndex.upsert({ ...record, data: { ...d, filename, categoryId, rootFolderId } })
    }

    // Serialize the full IndexRecord as JSON — lossless, no markdown parsing needed on pull
    const content = JSON.stringify({ ...record, data: { ...d, filename, categoryId, rootFolderId } })

    try {
      const folderId = await drive().resolveFolderId(token, categoryId, rootFolderId)

      const file = await drive().uploadFile(
        token, folderId, filename, content, 'application/json',
        record.driveEtag,
      )
      localIndex.markSynced(record.id, file.id, new Date().toISOString(), (file as { etag?: string }).etag)
      uploaded++

    } catch (err) {
      if (!(err instanceof ETagConflictError)) {
        // Non-conflict error — leave pending for next retry, surface the message
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${record.title}: ${msg}`)
        auditLog.error('sync.upload', `Upload failed: ${record.title} — ${msg}`, record.propertyId)
        continue
      }

      // ── Conflict resolution ──────────────────────────────────────────────
      await resolveConflict(token, record, err)
    }
  }

  return { uploaded, failed: errors.length, errors }
}

async function resolveConflict(
  _token:   string,
  record:   IndexRecord,
  conflict: ETagConflictError,
): Promise<void> {
  // Parse the remote record from JSON; fall back to empty data if corrupt
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
    // ── Auto-merge: no overlapping field mutations — local wins ──────────
    const mergedRecord: IndexRecord = {
      ...remoteRecord,
      ...record,
      data: { ...remoteData, ...localData },
    }

    try {
      const folderId = await drive().resolveFolderId(_token, categoryId, rootFolderId)
      const mergedFile = await drive().uploadFile(
        _token, folderId, filename, JSON.stringify(mergedRecord), 'application/json',
        conflict.latestEtag,
      )
      localIndex.markSynced(
        record.id,
        mergedFile.id,
        new Date().toISOString(),
        (mergedFile as { etag?: string }).etag,
      )
      auditLog.info('sync.conflict', `Auto-merged: ${record.title}`, record.propertyId)
    } catch {
      // If merge upload failed, leave as pending for next retry
    }

  } else {
    // ── True conflict: surface for user resolution ────────────────────────
    const ts     = Date.now()
    const v2Name = filename.replace(/\.json$/, '') + `_v2_${ts}.json`
    const v2Id   = `conflict_v2_${record.id}_${ts}`

    // Write local version as a new v2 file in Drive
    try {
      const v2Record: IndexRecord = {
        ...record,
        id:    v2Id,
        title: record.title + ' (v2)',
      }
      const folderId = await drive().resolveFolderId(_token, categoryId, rootFolderId)
      const v2File   = await drive().uploadFile(
        _token, folderId, v2Name, JSON.stringify(v2Record), 'application/json',
      )

      localIndex.upsert({
        ...v2Record,
        syncState:      'synced',
        driveFileId:    v2File.id,
        driveEtag:      (v2File as { etag?: string }).etag,
        conflictWithId: record.id,
        driveUpdatedAt: new Date().toISOString(),
      })
    } catch {
      // If v2 write failed, fall through — still mark original as conflict
    }

    // Mark the original as conflict (links to v2)
    const index = localIndex.getById(record.id)
    if (index) {
      localIndex.upsert({
        ...index,
        syncState:      'conflict',
        conflictWithId: v2Id,
      })
    }
    auditLog.warn('sync.conflict', `Conflict: ${record.title} saved as v2 (fields: ${overlap.join(', ')})`, record.propertyId)
  }
}

// ── Pull ─────────────────────────────────────────────────────────────────────

/**
 * List Drive files in all category folders for a property and restore any
 * unknown `.json` files into the local index.
 *
 * Each Drive file contains a full serialized IndexRecord (JSON). The record's
 * own `type` field is used — no filename-prefix heuristics needed.
 */
export async function pullFromDrive(
  token: string,
  propertyId: string,
): Promise<{ pulled: number; failed: number }> {
  const property = propertyStore.getById(propertyId)
  if (!property?.driveRootFolderId) return { pulled: 0, failed: 0 }

  const rootFolderId = property.driveRootFolderId

  // Build a set of known driveFileIds from all records for this property
  const knownDriveIds = new Set(
    localIndex.getAllForProperty(propertyId)
      .map(r => r.driveFileId)
      .filter(Boolean) as string[],
  )

  let pulled  = 0
  let failed  = 0

  // Scan ALL known Drive folders (equipment categories + domain store folders)
  for (const categoryId of Object.keys(CATEGORY_FOLDER_NAMES)) {
    try {
      const folderId = await drive().resolveFolderId(token, categoryId, rootFolderId)
      const files    = await drive().listFiles(token, folderId)

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        if (knownDriveIds.has(file.id))   continue

        try {
          const fileData = await drive().downloadFile(token, file.id)
          const stored   = JSON.parse(fileData.content) as IndexRecord

          // Restore the full record; update Drive metadata to reflect this pull
          localIndex.upsert({
            ...stored,
            // Ensure propertyId matches (safety guard for cross-property files)
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
    auditLog.info('sync.pull', msg, propertyId)
  }

  return { pulled, failed }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seed MAINTENANCE_TASKS into the local index for a property if not yet seeded.
 * Seeded tasks are 'local_only' — they won't be uploaded to Drive.
 * Also migrates any existing customTaskStore (pm_tasks / pm_custom_tasks) records.
 */
export async function seedTasksForProperty(propertyId: string): Promise<void> {
  if (localIndex.hasAny('task', propertyId)) return

  const today     = new Date().toISOString().slice(0, 10)
  const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  function calcStatus(task: MaintenanceTask): MaintenanceTask['status'] {
    if (task.status === 'completed') return 'completed'
    if (task.dueDate < today)        return 'overdue'
    if (task.dueDate <= sevenDays)   return 'due'
    return 'upcoming'
  }

  const property = propertyStore.getById(propertyId)
  const rootFolderId = property?.driveRootFolderId ?? ''

  function buildTaskData(task: MaintenanceTask, status: MaintenanceTask['status']): Record<string, unknown> {
    const withStatus = { ...task, status }
    return {
      ...withStatus,
      filename:    `task_${task.id}.json`,
      rootFolderId,
      categoryId:  task.categoryId,
    } as unknown as Record<string, unknown>
  }

  // Seed static mock tasks (only for properties that have them)
  const { MAINTENANCE_TASKS } = await import('../data/mockData')
  for (const task of MAINTENANCE_TASKS.filter(t => t.propertyId === propertyId)) {
    const status = calcStatus(task)
    localIndex.upsert({
      id:         task.id,
      type:       'task',
      categoryId: task.categoryId,
      propertyId: task.propertyId,
      title:      task.title,
      data:       buildTaskData(task, status),
      syncState:  'local_only',
    })
  }

  // Migrate user-created tasks from old stores
  const migrateKeys = ['pm_tasks', 'pm_custom_tasks']
  for (const key of migrateKeys) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as MaintenanceTask[]
      for (const task of stored.filter(t => t.propertyId === propertyId)) {
        if (localIndex.getById(task.id)) continue   // already seeded
        const status = calcStatus(task)
        localIndex.upsert({
          id:         task.id,
          type:       'task',
          categoryId: task.categoryId,
          propertyId: task.propertyId,
          title:      task.title,
          data:       buildTaskData(task, status),
          syncState:  'pending_upload',   // migrated — queue for Drive upload
        })
      }
    } catch {
      // ignore corrupt data
    }
  }
}

// ── Full sync ─────────────────────────────────────────────────────────────────

export async function syncAll(token: string, propertyId: string): Promise<SyncResult> {
  syncBus.emit({ type: 'sync-start', scope: 'full' })
  try {
    // Seed tasks first (no-op if already seeded)
    await seedTasksForProperty(propertyId)

    // Pull Drive files → add to index
    const { pulled, failed: pullFailed } = await pullFromDrive(token, propertyId)

    // Push pending local records → Drive
    const { uploaded, failed: uploadFailed, errors: uploadErrors } = await pushPending(token)

    const summary = `Sync complete: ↑${uploaded} uploaded ↓${pulled} pulled` +
      (uploadFailed + pullFailed > 0 ? ` · ${uploadFailed + pullFailed} errors` : '')
    auditLog.info('sync', summary, propertyId)

    return { uploaded, uploadFailed, uploadErrors, pulled, pullFailed }
  } finally {
    syncBus.emit({ type: 'sync-end', scope: 'full' })
  }
}

// ── Property config sync ──────────────────────────────────────────────────────

const PROPERTY_CONFIG_FILENAME = 'pm_properties.json'

/**
 * Pull property config from Drive (find by name among app-created files),
 * merge any unknown properties into the local store, then push the current
 * full list back to Drive (create or update).
 *
 * Called once per session from the startup sync, not per-property.
 */
export async function syncPropertyConfig(token: string): Promise<void> {
  // ── Pull ────────────────────────────────────────────────────────────────────
  try {
    const files = await drive().searchFiles(
      token,
      `name='${PROPERTY_CONFIG_FILENAME}' and trashed=false`,
    )
    if (files.length > 0) {
      const fileData = await drive().downloadFile(token, files[0].id)
      const remote   = JSON.parse(fileData.content) as import('../types').Property[]
      const localIds = new Set(propertyStore.getAll().map(p => p.id))
      for (const p of remote) {
        if (!localIds.has(p.id)) propertyStore.upsert(p)
      }
      propertyStore.setDriveFileId(files[0].id)
    }
  } catch { /* non-fatal — local store is authoritative */ }

  // ── Push ────────────────────────────────────────────────────────────────────
  try {
    const content      = JSON.stringify(propertyStore.getAll())
    const existingId   = propertyStore.getDriveFileId()

    if (existingId) {
      await drive().updateFile(token, existingId, content, 'application/json')
    } else {
      // Create at Drive root so it's findable on any device
      const file = await drive().uploadFile(token, 'root', PROPERTY_CONFIG_FILENAME, content, 'application/json')
      propertyStore.setDriveFileId(file.id)
    }
  } catch { /* non-fatal */ }
}

// ── Audit log sync ───────────────────────────────────────────────────────────

const AUDIT_LOG_FILENAME = 'pm_audit_log.json'

/**
 * Sync the audit log with Drive — pull remote entries (merge/dedup), then push
 * the full merged log back. File lives at Drive root, not in a property folder.
 */
export async function syncAuditLog(token: string): Promise<void> {
  // Pull remote log and merge with local
  try {
    const existingId = auditLog.getDriveFileId()
    let remoteFileId = existingId

    if (!remoteFileId) {
      const files = await drive().searchFiles(token, `name='${AUDIT_LOG_FILENAME}' and trashed=false`)
      if (files.length > 0) remoteFileId = files[0].id
    }

    if (remoteFileId) {
      const fileData = await drive().downloadFile(token, remoteFileId)
      const remote   = JSON.parse(fileData.content) as LogEntry[]
      auditLog.merge(remote)
      auditLog.setDriveFileId(remoteFileId)
    }
  } catch { /* non-fatal */ }

  // Push merged log to Drive
  try {
    const content  = JSON.stringify(auditLog.getAll())
    const fileId   = auditLog.getDriveFileId()
    if (fileId) {
      await drive().updateFile(token, fileId, content, 'application/json')
    } else {
      const file = await drive().uploadFile(token, 'root', AUDIT_LOG_FILENAME, content, 'application/json')
      auditLog.setDriveFileId(file.id)
    }
  } catch { /* non-fatal */ }
}

// ── Single-record pull ────────────────────────────────────────────────────────

/**
 * Pull the latest version of one record from Drive by driveFileId and update
 * the local index (as a remote-sourced change). Used for per-record "pull on
 * open" to show the user fresh data without waiting for a full sync.
 *
 * Returns true if the remote file differed from local (i.e. etag changed).
 * Returns false if there were no changes, or if the record has no driveFileId
 * (local-only — nothing to pull).
 */
export async function pullSingleRecord(token: string, recordId: string): Promise<boolean> {
  const record = localIndex.getById(recordId)
  if (!record?.driveFileId) return false

  syncBus.emit({ type: 'sync-start', scope: 'record', recordId })
  try {
    const fileData = await drive().downloadFile(token, record.driveFileId)
    // Etag unchanged — local is already current
    if (fileData.etag && fileData.etag === record.driveEtag) {
      syncBus.emit({ type: 'sync-end', scope: 'record', recordId })
      return false
    }
    let stored: IndexRecord
    try {
      stored = JSON.parse(fileData.content) as IndexRecord
    } catch {
      syncBus.emit({ type: 'sync-end', scope: 'record', recordId, error: 'parse' })
      return false
    }
    localIndex.upsert({
      ...stored,
      propertyId:     record.propertyId,     // preserve local propertyId as safety
      syncState:      'synced',
      driveFileId:    record.driveFileId,
      driveEtag:      fileData.etag,
      driveUpdatedAt: new Date().toISOString(),
    }, 'remote')
    syncBus.emit({ type: 'sync-end', scope: 'record', recordId })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    syncBus.emit({ type: 'sync-end', scope: 'record', recordId, error: msg })
    return false
  }
}

// ── Drive change-token polling ────────────────────────────────────────────────

/**
 * Poll Drive /changes for files modified since the last poll, then pull any
 * changes that affect records already in the local index. Much cheaper than a
 * full folder scan — call this every ~30s while the tab is visible.
 *
 * First call acquires a startPageToken and returns without pulling (sets the
 * baseline). Subsequent calls apply deltas.
 *
 * If the stored token is rejected (404), we reset and re-baseline; callers can
 * trigger a full pullFromDrive to catch up if needed.
 */
export async function pollDriveChanges(token: string): Promise<{ applied: number; reset: boolean }> {
  let pageToken = localStorage.getItem(CHANGES_TOKEN_KEY)

  // First-time setup: get a baseline token, do nothing else this poll.
  if (!pageToken) {
    try {
      const fresh = await drive().getStartPageToken(token)
      localStorage.setItem(CHANGES_TOKEN_KEY, fresh)
    } catch { /* offline — try again next poll */ }
    return { applied: 0, reset: false }
  }

  syncBus.emit({ type: 'sync-start', scope: 'delta' })

  // Build a lookup from driveFileId → local recordId so we can match changes to
  // records we care about, and skip everything else in the user's Drive.
  const byDriveId = new Map<string, string>()
  for (const p of propertyStore.getAll()) {
    for (const r of localIndex.getAllForProperty(p.id)) {
      if (r.driveFileId) byDriveId.set(r.driveFileId, r.id)
    }
  }

  let applied = 0
  let reset   = false
  try {
    while (pageToken) {
      let page
      try {
        page = await drive().listChanges(token, pageToken)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // 404 means the token expired — reset and bail; caller can do full pull.
        if (msg.includes('404')) {
          localStorage.removeItem(CHANGES_TOKEN_KEY)
          try {
            const fresh = await drive().getStartPageToken(token)
            localStorage.setItem(CHANGES_TOKEN_KEY, fresh)
          } catch { /* ignore */ }
          reset = true
          break
        }
        throw err
      }

      for (const ch of page.changes) {
        const recordId = byDriveId.get(ch.fileId)
        if (!recordId) continue   // not one of ours
        if (ch.removed || ch.file?.trashed) {
          localIndex.softDelete(recordId)
          applied++
          continue
        }
        const fresh = await pullSingleRecord(token, recordId)
        if (fresh) applied++
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken
        continue
      }
      if (page.newStartPageToken) {
        localStorage.setItem(CHANGES_TOKEN_KEY, page.newStartPageToken)
      }
      break
    }
  } catch {
    // Non-fatal — keep existing token, try again next poll
  } finally {
    syncBus.emit({ type: 'sync-end', scope: 'delta' })
  }

  if (applied > 0) {
    auditLog.info('sync.delta', `Applied ${applied} remote change${applied > 1 ? 's' : ''}`)
  }
  return { applied, reset }
}

// Re-export IndexRecordType for callers that imported it from here
export type { IndexRecordType }
