import { DriveClient } from './driveClient'
import { localIndex } from './localIndex'
import { MAINTENANCE_TASKS, PROPERTIES, CATEGORIES } from '../data/mockData'
import type { MaintenanceTask } from '../types'

export interface SyncResult {
  uploaded: number
  uploadFailed: number
  pulled: number
  pullFailed: number
}

// ── Push ─────────────────────────────────────────────────────────────────────

/**
 * Upload all pending_upload records to Drive.
 * Each record must have data.mdContent, data.filename, data.rootFolderId, data.categoryId.
 */
export async function pushPending(token: string): Promise<{ uploaded: number; failed: number }> {
  const pending = localIndex.getPending()
  let uploaded = 0

  for (const record of pending) {
    const { mdContent, filename, rootFolderId, categoryId } = record.data as {
      mdContent: string
      filename: string
      rootFolderId: string
      categoryId: string
    }

    if (!mdContent || !filename || !rootFolderId || !categoryId) {
      // Missing required Drive metadata — leave as pending, don't fail
      continue
    }

    try {
      const folderId = await DriveClient.resolveFolderId(token, categoryId, rootFolderId)
      const file     = await DriveClient.uploadFile(token, folderId, filename, mdContent, 'text/markdown')
      localIndex.markSynced(record.id, file.id, new Date().toISOString())
      uploaded++
    } catch {
      // Leave as pending_upload for next attempt
    }
  }

  const failed = localIndex.getPending().length
  return { uploaded, failed }
}

// ── Pull ─────────────────────────────────────────────────────────────────────

/**
 * List Drive files in all category folders for a property and add any unknown
 * files to the local index as type='equipment', syncState='synced'.
 * Does NOT download or parse file content — just tracks existence.
 */
export async function pullFromDrive(
  token: string,
  propertyId: string,
): Promise<{ pulled: number; failed: number }> {
  const property = PROPERTIES.find(p => p.id === propertyId)
  if (!property?.driveRootFolderId) return { pulled: 0, failed: 0 }

  const rootFolderId = property.driveRootFolderId

  // Build a set of known driveFileIds for fast lookup
  const knownDriveIds = new Set(
    localIndex.getAll('equipment', propertyId)
      .map(r => r.driveFileId)
      .filter(Boolean) as string[],
  )

  let pulled  = 0
  let failed  = 0

  for (const cat of CATEGORIES) {
    try {
      const folderId = await DriveClient.resolveFolderId(token, cat.id, rootFolderId)
      const files    = await DriveClient.listFiles(token, folderId)

      for (const file of files) {
        if (!file.name.endsWith('.md')) continue
        if (knownDriveIds.has(file.id))  continue

        localIndex.upsert({
          id:            `drive_${file.id}`,
          type:          'equipment',
          categoryId:    cat.id,
          propertyId,
          title:         file.name.replace(/\.md$/, ''),
          data:          { filename: file.name, driveFileId: file.id },
          syncState:     'synced',
          driveFileId:   file.id,
          driveUpdatedAt: new Date().toISOString(),
        })
        knownDriveIds.add(file.id)
        pulled++
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

  // Seed static mock tasks
  for (const task of MAINTENANCE_TASKS.filter(t => t.propertyId === propertyId)) {
    const status = calcStatus(task)
    localIndex.upsert({
      id:         task.id,
      type:       'task',
      categoryId: task.categoryId,
      propertyId: task.propertyId,
      title:      task.title,
      data:       { ...task, status } as unknown as Record<string, unknown>,
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
          data:       { ...task, status } as unknown as Record<string, unknown>,
          syncState:  'local_only',   // migrated — no Drive file yet
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
  const { uploaded, failed: uploadFailed } = await pushPending(token)

  return { uploaded, uploadFailed, pulled, pullFailed }
}
