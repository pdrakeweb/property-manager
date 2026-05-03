/**
 * Application sync engine — thin adapter over the vault.
 *
 * The generic push/pull/conflict logic lives in `@/vault/core/syncEngine`.
 * This file keeps the app-level orchestration that the vault package
 * deliberately does not own:
 *   - seeding maintenance tasks from mock data,
 *   - syncing the app-level `propertyStore` config file,
 *   - syncing the audit log,
 *   - per-record pull + Drive /changes delta polling (they touch the raw
 *     DriveClient for endpoints the vault doesn't expose yet).
 *
 * The public signatures (`syncAll(token, propertyId)` etc.) are preserved
 * for backwards compatibility with callers in screens and services. The
 * `token` parameter on the vault-delegating functions is ignored — the
 * vault singleton picks up the current auth state itself via
 * `vaultSingleton.getVault()`.
 */

import { DriveClient } from './driveClient'
import { localDriveAdapter } from './localDriveAdapter'
import { localIndex } from './localIndex'
import { propertyStore } from './propertyStore'
import { auditLog } from './auditLog'
import { syncBus } from './syncBus'
import type { LogEntry } from './auditLog'
import type { IndexRecord } from './localIndex'
import type { MaintenanceTask } from '../types'
import { getVault } from './vaultSingleton'
import type { IndexRecordType } from './localIndex'
import type { SyncResult as VaultSyncResult } from '../vault'

const CHANGES_TOKEN_KEY = 'pm_drive_changes_token'

/** Real DriveClient in production, localStorage adapter in dev bypass mode. */
function drive(): typeof DriveClient {
  const token = localStorage.getItem('google_access_token')
  return token === 'dev_token'
    ? (localDriveAdapter as typeof DriveClient)
    : DriveClient
}

export type SyncResult = VaultSyncResult

// ── Push / pull / full sync (delegated to vault) ─────────────────────────────

export async function pushPending(_token: string): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  return getVault().pushPending()
}

export async function pullFromDrive(_token: string, propertyId: string): Promise<{ pulled: number; failed: number; conflicts: number }> {
  return getVault().pullFromDrive(propertyId)
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seed MAINTENANCE_TASKS into the local index for a property if not yet seeded.
 * Kept here because the seed data is an app-level concern (mock catalogue)
 * that the generic vault should not know about.
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

  const { MAINTENANCE_TASKS } = await import('../data/mockData')
  for (const task of MAINTENANCE_TASKS.filter(t => t.propertyId === propertyId)) {
    const status = calcStatus(task)
    localIndex.upsert({
      id:         task.id,
      type:       'task' as IndexRecordType,
      categoryId: task.categoryId,
      propertyId: task.propertyId,
      title:      task.title,
      data:       buildTaskData(task, status),
      syncState:  'local_only',
    })
  }

  const migrateKeys = ['pm_tasks', 'pm_custom_tasks']
  for (const key of migrateKeys) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as MaintenanceTask[]
      for (const task of stored.filter(t => t.propertyId === propertyId)) {
        if (localIndex.getById(task.id)) continue
        const status = calcStatus(task)
        localIndex.upsert({
          id:         task.id,
          type:       'task' as IndexRecordType,
          categoryId: task.categoryId,
          propertyId: task.propertyId,
          title:      task.title,
          data:       buildTaskData(task, status),
          syncState:  'pending_upload',
        })
      }
    } catch {
      /* ignore corrupt data */
    }
  }
}

// ── Full sync ────────────────────────────────────────────────────────────────

/**
 * Single-flight guard. `syncAll` is invoked from at least three places that can
 * fire concurrently — the startup `run()`, the 5-minute interval re-run, and
 * the visibility/focus listeners — and each property's full sync issues many
 * Drive round-trips. Re-entrant calls would interleave pulls and pushes,
 * waste quota, and risk pull-after-push echo races. Skipping when one is
 * already in flight is safer and the next scheduled tick will pick up any
 * new work.
 */
let activeFullSync = false

const NO_OP_SYNC_RESULT: SyncResult = {
  uploaded: 0, uploadFailed: 0, uploadErrors: [], pulled: 0, pullFailed: 0, pullConflicts: 0,
}

export async function syncAll(_token: string, propertyId: string): Promise<SyncResult> {
  if (activeFullSync) {
    auditLog.warn(
      'sync.skip',
      `syncAll for ${propertyId} skipped — another full sync is already in progress`,
      propertyId,
    )
    return NO_OP_SYNC_RESULT
  }
  activeFullSync = true
  syncBus.emit({ type: 'sync-start', scope: 'full' })
  try {
    await seedTasksForProperty(propertyId)
    return await getVault().syncAll(propertyId)
  } finally {
    syncBus.emit({ type: 'sync-end', scope: 'full' })
    activeFullSync = false
  }
}

// ── Property config sync ─────────────────────────────────────────────────────
//
// Properties are first-class records in the local index (type 'property') and
// individually flow through the standard pull/push paths in the vault: each
// property gets uploaded to its own driveRootFolderId/Property/property_<id>.json
// when its `pending_upload` state is processed.
//
// In addition, a global `pm_properties.json` manifest at the Drive root holds
// the full list — preserved for back-compat with installs that pre-date the
// per-record property sync, and for fresh devices that need to discover the
// existing property set before any individual driveRootFolderIds are known.

const PROPERTY_CONFIG_FILENAME = 'pm_properties.json'

export async function syncPropertyConfig(token: string): Promise<void> {
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
  } catch { /* non-fatal */ }

  try {
    const content    = JSON.stringify(propertyStore.getAll())
    const existingId = propertyStore.getDriveFileId()
    if (existingId) {
      await drive().updateFile(token, existingId, content, 'application/json')
    } else {
      const file = await drive().uploadFile(token, 'root', PROPERTY_CONFIG_FILENAME, content, 'application/json')
      propertyStore.setDriveFileId(file.id)
    }
  } catch { /* non-fatal */ }
}

// ── Audit log sync ───────────────────────────────────────────────────────────

const AUDIT_LOG_FILENAME = 'pm_audit_log.json'

export async function syncAuditLog(token: string): Promise<void> {
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

// ── Photo upload sync ────────────────────────────────────────────────────────

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const resp = await fetch(dataUrl)
  return resp.blob()
}

function extFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);/)
  return m ? m[1].toLowerCase() : 'jpg'
}

/**
 * Walk every completed_event record across all properties and upload any photo
 * whose `localDataUrl` is set but `driveFileId` is not. After a successful
 * upload, the record's photo is rewritten so `driveFileId` points at the new
 * Drive file and `localDataUrl` is cleared (empty string) — that drops the
 * base64 payload out of localStorage so it doesn't grow unbounded as more
 * photos are captured.
 *
 * Updates flow back through `costStore.update`, which marks the record
 * `pending_upload` so the next sync round flushes the trimmed JSON to Drive.
 */
export async function syncPendingPhotos(): Promise<{ uploaded: number; failed: number }> {
  const drv = drive()

  // Lazy-import costStore to avoid the syncEngine ↔ costStore import cycle
  // that would otherwise form via syncedStore.
  const { costStore } = await import('./costStore')

  let uploaded = 0
  let failed   = 0

  for (const property of propertyStore.getAll()) {
    if (!property.driveRootFolderId) continue

    const events = costStore.getAll().filter(e => e.propertyId === property.id)
    for (const event of events) {
      if (!event.photos || event.photos.length === 0) continue

      let dirty = false
      const updatedPhotos = await Promise.all(event.photos.map(async photo => {
        if (photo.driveFileId || !photo.localDataUrl) return photo
        try {
          const blob     = await dataUrlToBlob(photo.localDataUrl)
          const ext      = extFromDataUrl(photo.localDataUrl)
          const filename = `${photo.id}.${ext}`
          const fileId   = await drv.uploadPhoto(property.id, event.id, blob, filename)
          dirty = true
          uploaded++
          return { ...photo, driveFileId: fileId, localDataUrl: '' }
        } catch (err) {
          failed++
          auditLog.warn(
            'photo.upload',
            `Photo upload failed for event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
            property.id,
          )
          return photo
        }
      }))

      if (dirty) {
        costStore.update({ ...event, photos: updatedPhotos })
      }
    }
  }

  return { uploaded, failed }
}

// ── Single-record pull ───────────────────────────────────────────────────────

/**
 * Pull the latest version of one record from Drive by driveFileId and update
 * the local index (as a remote-sourced change). Used for per-record "pull on
 * open" to show the user fresh data without waiting for a full sync.
 *
 * Returns true if the remote file differed from local (etag changed).
 * Returns false if no changes or if the record has no driveFileId (local-only).
 */
export async function pullSingleRecord(token: string, recordId: string): Promise<boolean> {
  const record = localIndex.getById(recordId)
  if (!record?.driveFileId) return false

  syncBus.emit({ type: 'sync-start', scope: 'record', recordId })
  try {
    const fileData = await drive().downloadFile(token, record.driveFileId)
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
      propertyId:     record.propertyId,
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

// ── Drive change-token polling ───────────────────────────────────────────────

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

  if (!pageToken) {
    try {
      const fresh = await drive().getStartPageToken(token)
      localStorage.setItem(CHANGES_TOKEN_KEY, fresh)
    } catch { /* offline — try again next poll */ }
    return { applied: 0, reset: false }
  }

  syncBus.emit({ type: 'sync-start', scope: 'delta' })

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
        if (!recordId) continue
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
    /* non-fatal — keep existing token, try again next poll */
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
