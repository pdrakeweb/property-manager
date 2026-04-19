import { DriveClient, ETagConflictError, CATEGORY_FOLDER_NAMES } from './driveClient'
import { localDriveAdapter } from './localDriveAdapter'
import { localIndex } from './localIndex'
import type { IndexRecord, IndexRecordType } from './localIndex'
import { MAINTENANCE_TASKS, PROPERTIES } from '../data/mockData'
import type { MaintenanceTask } from '../types'

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
    const { filename, rootFolderId, categoryId } = record.data as {
      filename:     string
      rootFolderId: string
      categoryId:   string
    }

    // Records missing Drive metadata can't be uploaded — skip silently (not a failure)
    if (!filename || !rootFolderId || !categoryId) continue

    // Serialize the full IndexRecord as JSON — lossless, no markdown parsing needed on pull
    const content = JSON.stringify(record)

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
  const property = PROPERTIES.find(p => p.id === propertyId)
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
          })
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

  return { pulled, failed }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seed MAINTENANCE_TASKS into the local index for a property if not yet seeded.
 * Seeded tasks are 'local_only' — they won't be uploaded to Drive.
 * Also migrates any existing customTaskStore (pm_tasks / pm_custom_tasks) records.
 */
export function seedTasksForProperty(propertyId: string): void {
  if (localIndex.hasAny('task', propertyId)) return

  const today     = new Date().toISOString().slice(0, 10)
  const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  function calcStatus(task: MaintenanceTask): MaintenanceTask['status'] {
    if (task.status === 'completed') return 'completed'
    if (task.dueDate < today)        return 'overdue'
    if (task.dueDate <= sevenDays)   return 'due'
    return 'upcoming'
  }

  const property = PROPERTIES.find(p => p.id === propertyId)
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

  // Seed static mock tasks
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
  // Seed tasks first (no-op if already seeded)
  seedTasksForProperty(propertyId)

  // Pull Drive files → add to index
  const { pulled, failed: pullFailed } = await pullFromDrive(token, propertyId)

  // Push pending local records → Drive
  const { uploaded, failed: uploadFailed, errors: uploadErrors } = await pushPending(token)

  return { uploaded, uploadFailed, uploadErrors, pulled, pullFailed }
}

// Re-export IndexRecordType for callers that imported it from here
export type { IndexRecordType }
