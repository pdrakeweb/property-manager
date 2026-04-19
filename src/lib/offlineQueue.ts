// Offline upload queue backed by localStorage.
// Entries are persisted across page reloads and retried with exponential backoff.
// Items exceeding MAX_ATTEMPTS are marked as "failed" so the UI can surface them
// (they stay in the queue but are skipped by automatic retries).

import { DriveClient } from './driveClient'

export interface QueuedUpload {
  id:            string
  categoryId:    string
  rootFolderId:  string
  filename:      string
  content:       string   // JSON-serialized IndexRecord
  capturedAt:    string
  enqueuedAt:    string

  // Retry bookkeeping (optional for backwards compat with older persisted entries)
  attempts?:     number
  lastAttemptAt?: string
  lastError?:    string
  permanentlyFailed?: boolean
}

const QUEUE_KEY = 'property_manager_offline_queue'

/** Max automatic retries before an item is marked permanentlyFailed. */
export const MAX_ATTEMPTS = 6

/** Exponential backoff: 30s, 1m, 2m, 4m, 8m, 16m — capped at 30m. */
function backoffDelayMs(attempts: number): number {
  return Math.min(30 * 1000 * Math.pow(2, attempts), 30 * 60 * 1000)
}

function load(): QueuedUpload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedUpload[]
  } catch {
    return []
  }
}

function save(queue: QueuedUpload[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/** Add a failed upload to the queue */
export function enqueue(item: Omit<QueuedUpload, 'id' | 'enqueuedAt'>): void {
  const queue = load()
  queue.push({
    ...item,
    id:          crypto.randomUUID(),
    enqueuedAt:  new Date().toISOString(),
    attempts:    item.attempts ?? 0,
  })
  save(queue)
}

/** How many uploads are waiting (excludes permanently failed) */
export function getQueueCount(): number {
  return load().filter(i => !i.permanentlyFailed).length
}

/** All items currently in the queue, including permanently failed ones. */
export function getQueueItems(): QueuedUpload[] {
  return load()
}

/** Remove an item (e.g. user dismissed a permanently failed entry). */
export function dismiss(id: string): void {
  save(load().filter(i => i.id !== id))
}

/** Manually reset a permanently failed entry so it's eligible again. */
export function resetFailed(id: string): void {
  const queue = load()
  const i = queue.findIndex(x => x.id === id)
  if (i < 0) return
  const item = queue[i]!
  queue[i] = { ...item, attempts: 0, permanentlyFailed: false, lastError: undefined }
  save(queue)
}

/**
 * Attempt to upload queued items whose backoff window has elapsed.
 *
 * Items that fail are rescheduled with exponential backoff (30s, 1m, 2m, 4m, 8m, 16m).
 * After MAX_ATTEMPTS failures an item is marked `permanentlyFailed` and skipped
 * until the user explicitly retries (via resetFailed) or dismisses it.
 */
export async function retryAll(
  getToken: () => Promise<string | null>,
): Promise<{ succeeded: number; failed: number; skipped: number; permanent: number }> {
  const queue: QueuedUpload[] = load()
  const now = Date.now()

  let succeeded = 0
  let skipped   = 0
  let permanent = 0

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!

    if (item.permanentlyFailed) { permanent++; continue }

    // Enforce backoff: skip if we tried too recently relative to attempt count
    const attempts = item.attempts ?? 0
    if (attempts > 0 && item.lastAttemptAt) {
      const nextAt = new Date(item.lastAttemptAt).getTime() + backoffDelayMs(attempts - 1)
      if (now < nextAt) { skipped++; continue }
    }

    try {
      const token = await getToken()
      if (!token) { skipped++; continue }   // no token right now — try again next tick

      const folderId = await DriveClient.resolveFolderId(token, item.categoryId, item.rootFolderId)
      await DriveClient.uploadFile(token, folderId, item.filename, item.content, 'application/json')
      // Success: drop from queue
      queue.splice(i, 1)
      i--
      succeeded++
    } catch (err) {
      const nextAttempts = attempts + 1
      const failed: QueuedUpload = {
        ...item,
        attempts:      nextAttempts,
        lastAttemptAt: new Date().toISOString(),
        lastError:     err instanceof Error ? err.message : String(err),
        ...(nextAttempts >= MAX_ATTEMPTS ? { permanentlyFailed: true } : {}),
      }
      queue[i] = failed
      if (failed.permanentlyFailed) permanent++
    }
  }

  save(queue)
  const pendingFailed = queue.filter(i => !i.permanentlyFailed).length
  return { succeeded, failed: pendingFailed, skipped, permanent }
}
