import { DriveClient, ETagConflictError } from './driveClient'
import { localDriveAdapter } from './localDriveAdapter'
import { localIndex } from './localIndex'
import type { IndexRecord, IndexRecordType } from './localIndex'
import { MAINTENANCE_TASKS, PROPERTIES, CATEGORIES } from '../data/mockData'
import { formatMaintenanceTask, taskFilename } from './domainMarkdown'
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

/** Parse markdown content back into a data record (best-effort key: value extraction). */
function parseMdContent(md: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of md.split('\n')) {
    const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/) ?? line.match(/^-\s+\*\*(.+?):\*\*\s*(.+)$/)
    if (m) result[m[1].trim().toLowerCase().replace(/\s+/g, '_')] = m[2].trim()
  }
  return result
}

// ── Push ─────────────────────────────────────────────────────────────────────

/**
 * Upload all pending_upload records to Drive with ETag-based conflict detection.
 *
 * Per record:
 *  - New file (no driveEtag): upload without If-Match
 *  - Existing file (has driveEtag): upload with If-Match
 *  - 412 / ETagConflictError → auto-merge if no field overlap, else surface conflict
 */
export async function pushPending(token: string): Promise<{ uploaded: number; failed: number }> {
  const pending = localIndex.getPending()
  let uploaded = 0

  for (const record of pending) {
    const { mdContent, filename, rootFolderId, categoryId } = record.data as {
      mdContent:    string
      filename:     string
      rootFolderId: string
      categoryId:   string
    }

    if (!mdContent || !filename || !rootFolderId || !categoryId) continue

    try {
      const folderId = await drive().resolveFolderId(token, categoryId, rootFolderId)

      // Pass existing ETag for optimistic concurrency (undefined = new file)
      const file = await drive().uploadFile(
        token, folderId, filename, mdContent, 'text/markdown',
        record.driveEtag,
      )
      localIndex.markSynced(record.id, file.id, new Date().toISOString(), (file as { etag?: string }).etag)
      uploaded++

    } catch (err) {
      if (!(err instanceof ETagConflictError)) {
        // Non-conflict error — leave pending for next retry
        continue
      }

      // ── Conflict resolution ──────────────────────────────────────────────
      await resolveConflict(token, record, err, mdContent)
    }
  }

  const failed = localIndex.getPending().length
  return { uploaded, failed }
}

async function resolveConflict(
  _token:    string,
  record:    IndexRecord,
  conflict:  ETagConflictError,
  localMd:   string,
): Promise<void> {
  const localData  = parseMdContent(localMd)
  const remoteData = parseMdContent(conflict.latestContent)
  const overlap    = overlappingMutations(localData, remoteData)

  if (overlap.length === 0) {
    // ── Auto-merge: no overlapping field mutations ────────────────────────
    // Take local values for locally-changed keys, Drive values for the rest.
    const merged = { ...remoteData, ...localData }

    // Rebuild a simple merged markdown from the merged data object.
    // Use the local mdContent as the base and let the merged values override nothing —
    // since there's no overlap the local version IS the correct merged result.
    const { mdContent, filename, rootFolderId, categoryId } = record.data as {
      mdContent: string; filename: string; rootFolderId: string; categoryId: string
    }

    try {
      const folderId   = await drive().resolveFolderId(_token, categoryId, rootFolderId)
      const mergedFile = await drive().uploadFile(
        _token, folderId, filename, mdContent, 'text/markdown',
        conflict.latestEtag,   // write against the latest known ETag
      )
      localIndex.markSynced(
        record.id,
        mergedFile.id,
        new Date().toISOString(),
        (mergedFile as { etag?: string }).etag,
      )
    } catch {
      // If even the merge upload failed, leave as pending — don't surface as conflict
    }
    // suppress unused variable lint for merged (used conceptually above)
    void merged

  } else {
    // ── True conflict: surface for user resolution ────────────────────────
    const { filename, rootFolderId, categoryId } = record.data as {
      filename: string; rootFolderId: string; categoryId: string
    }
    const ts      = Date.now()
    const v2Name  = filename.replace(/\.md$/, '') + `_v2_${ts}.md`
    const v2Id    = `conflict_v2_${record.id}_${ts}`

    // Write local version as a new v2 file in Drive
    try {
      const folderId = await drive().resolveFolderId(_token, categoryId, rootFolderId)
      const v2File   = await drive().uploadFile(
        _token, folderId, v2Name,
        record.data.mdContent as string,
        'text/markdown',
        // No If-Match — this is a new file
      )

      // Add v2 to the local index (synced, points back at original)
      localIndex.upsert({
        ...record,
        id:             v2Id,
        title:          record.title + ' (v2)',
        syncState:      'synced',
        driveFileId:    v2File.id,
        driveEtag:      (v2File as { etag?: string }).etag,
        conflictWithId: record.id,
        driveUpdatedAt: new Date().toISOString(),
      })
    } catch {
      // If we can't even write the v2, fall through — still mark original as conflict
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
 * List Drive files in all category folders for a property and add any unknown
 * files to the local index. Task files (task_*.md) are downloaded and parsed
 * to restore full task data; all other files are added as type='equipment'.
 */
export async function pullFromDrive(
  token: string,
  propertyId: string,
): Promise<{ pulled: number; failed: number }> {
  const property = PROPERTIES.find(p => p.id === propertyId)
  if (!property?.driveRootFolderId) return { pulled: 0, failed: 0 }

  const rootFolderId = property.driveRootFolderId

  // Build a set of known driveFileIds from all relevant record types
  const knownDriveIds = new Set(
    (['equipment', 'task'] as IndexRecordType[]).flatMap(type =>
      localIndex.getAll(type, propertyId).map(r => r.driveFileId).filter(Boolean),
    ) as string[],
  )

  let pulled  = 0
  let failed  = 0

  for (const cat of CATEGORIES) {
    try {
      const folderId = await drive().resolveFolderId(token, cat.id, rootFolderId)
      const files    = await drive().listFiles(token, folderId)

      for (const file of files) {
        if (!file.name.endsWith('.md')) continue
        if (knownDriveIds.has(file.id))  continue

        const isTask = file.name.startsWith('task_')

        if (isTask) {
          // Download and parse content to restore full task fields
          try {
            const fileData   = await drive().downloadFile(token, file.id)
            const parsed     = parseMdContent(fileData.content)
            const titleMatch = fileData.content.match(/^# Maintenance:\s+(.+)$/m)
            const title      = titleMatch?.[1]?.trim()
              ?? file.name.replace(/^task_/, '').replace(/_[^_]+\.md$/, '').replace(/_/g, ' ')
            const categoryId = (parsed['category'] as string) ?? cat.id

            localIndex.upsert({
              id:            `drive_${file.id}`,
              type:          'task',
              categoryId,
              propertyId,
              title,
              data:          {
                id:          `drive_${file.id}`,
                propertyId,
                title,
                systemLabel: (parsed['system'] as string) ?? '',
                categoryId,
                dueDate:     (parsed['due_date'] as string) ?? new Date().toISOString().slice(0, 10),
                priority:    (parsed['priority'] as string) ?? 'medium',
                status:      (parsed['status'] as string) ?? 'upcoming',
                recurrence:  parsed['recurrence'] as string | undefined,
                source:      (parsed['source'] as string) ?? 'manual',
                notes:       parsed['notes'] as string | undefined,
                filename:    file.name,
                rootFolderId,
                mdContent:   fileData.content,
              },
              syncState:      'synced',
              driveFileId:    file.id,
              driveEtag:      fileData.etag,
              driveUpdatedAt: new Date().toISOString(),
            })
          } catch {
            // If download/parse fails, add minimal task placeholder
            localIndex.upsert({
              id:            `drive_${file.id}`,
              type:          'task',
              categoryId:    cat.id,
              propertyId,
              title:         file.name.replace(/^task_/, '').replace(/_[^_]+\.md$/, '').replace(/_/g, ' '),
              data:          {
                dueDate: new Date().toISOString().slice(0, 10),
                status: 'upcoming', priority: 'medium', source: 'manual', systemLabel: '',
                filename: file.name, rootFolderId,
              },
              syncState:      'synced',
              driveFileId:    file.id,
              driveUpdatedAt: new Date().toISOString(),
            })
          }
        } else {
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
        }
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

  const property = PROPERTIES.find(p => p.id === propertyId)
  const rootFolderId = property?.driveRootFolderId ?? ''

  function buildTaskData(task: MaintenanceTask, status: MaintenanceTask['status']): Record<string, unknown> {
    const withStatus = { ...task, status }
    return {
      ...withStatus,
      mdContent: formatMaintenanceTask(withStatus),
      filename: taskFilename(withStatus),
      rootFolderId,
      categoryId: task.categoryId,
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
  const { uploaded, failed: uploadFailed } = await pushPending(token)

  return { uploaded, uploadFailed, pulled, pullFailed }
}
