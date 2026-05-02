// Offline upload queue backed by localStorage.
// Entries are persisted across page reloads and retried with exponential
// backoff. After MAX_RETRIES failures, an item is marked 'failed' and is no
// longer retried automatically — the user must explicitly reset it.

export type QueuedStatus = 'pending' | 'failed'

export interface QueuedUpload {
  id:            string
  categoryId:    string
  rootFolderId:  string
  filename:      string
  content:       string   // JSON-serialized IndexRecord
  capturedAt:    string
  enqueuedAt:    string
  retryCount:    number
  lastAttemptAt: number   // epoch ms; 0 = never attempted
  status:        QueuedStatus
}

const QUEUE_KEY    = 'property_manager_offline_queue'
const MAX_RETRIES  = 5
const BASE_DELAY   = 30_000     // 30s
const MAX_DELAY    = 3_600_000  // 1h

function backoffDelay(retryCount: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY)
}

function isDue(item: QueuedUpload, now: number): boolean {
  if (item.status === 'failed') return false
  if (item.lastAttemptAt === 0) return true
  return now - item.lastAttemptAt > backoffDelay(item.retryCount)
}

// Migrate legacy items (pre-backoff schema) to the new shape.
function normalize(raw: Partial<QueuedUpload>): QueuedUpload {
  return {
    id:            raw.id            ?? crypto.randomUUID(),
    categoryId:    raw.categoryId    ?? '',
    rootFolderId:  raw.rootFolderId  ?? '',
    filename:      raw.filename      ?? '',
    content:       raw.content       ?? '',
    capturedAt:    raw.capturedAt    ?? '',
    enqueuedAt:    raw.enqueuedAt    ?? new Date().toISOString(),
    retryCount:    typeof raw.retryCount    === 'number' ? raw.retryCount    : 0,
    lastAttemptAt: typeof raw.lastAttemptAt === 'number' ? raw.lastAttemptAt : 0,
    status:        raw.status === 'failed' ? 'failed' : 'pending',
  }
}

function load(): QueuedUpload[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Partial<QueuedUpload>[]
    return raw.map(normalize)
  } catch {
    return []
  }
}

function save(queue: QueuedUpload[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/** Add a failed upload to the queue */
export function enqueue(item: Omit<QueuedUpload, 'id' | 'enqueuedAt' | 'retryCount' | 'lastAttemptAt' | 'status'>): void {
  const queue = load()
  queue.push({
    ...item,
    id:            crypto.randomUUID(),
    enqueuedAt:    new Date().toISOString(),
    retryCount:    0,
    lastAttemptAt: 0,
    status:        'pending',
  })
  save(queue)
}

/** Total items waiting (pending + failed) */
export function getQueueCount(): number {
  return load().length
}

/** Items still eligible for automatic retry */
export function getPendingCount(): number {
  return load().filter(i => i.status === 'pending').length
}

/** Items that exhausted retries and need user action */
export function getFailedCount(): number {
  return load().filter(i => i.status === 'failed').length
}

export function getAllItems(): QueuedUpload[] {
  return load()
}

export function getFailedItems(): QueuedUpload[] {
  return load().filter(i => i.status === 'failed')
}

/** Reset a failed item so it will be retried on the next pass */
export function resetItem(id: string): void {
  const queue = load()
  const item = queue.find(i => i.id === id)
  if (!item) return
  item.status        = 'pending'
  item.retryCount    = 0
  item.lastAttemptAt = 0
  save(queue)
}

/** Reset all failed items */
export function resetFailedItems(): void {
  const queue = load()
  for (const item of queue) {
    if (item.status === 'failed') {
      item.status        = 'pending'
      item.retryCount    = 0
      item.lastAttemptAt = 0
    }
  }
  save(queue)
}

/** Remove an item from the queue entirely */
export function removeItem(id: string): void {
  save(load().filter(i => i.id !== id))
}

/**
 * Attempt to upload eligible queued items.
 *
 * Items are skipped (left in the queue) if they are not yet due per backoff.
 * Items that fail have their retryCount incremented; once retryCount reaches
 * MAX_RETRIES they are marked 'failed' and will not be retried automatically.
 */
export async function retryAll(getToken: () => Promise<string | null>): Promise<{ succeeded: number; failed: number; skipped: number }> {
  // Lazy import to avoid circular dependency
  const { DriveClient } = await import('./driveClient')

  const queue = load()
  const now   = Date.now()
  let succeeded = 0
  let skipped   = 0
  const next: QueuedUpload[] = []

  for (const item of queue) {
    if (!isDue(item, now)) {
      next.push(item)
      if (item.status === 'pending') skipped++
      continue
    }

    try {
      const token = await getToken()
      if (!token) {
        // Treat lack of token as a skip — don't burn a retry attempt for it.
        next.push(item)
        skipped++
        continue
      }

      const folderId = await DriveClient.resolveFolderId(token, item.categoryId, item.rootFolderId)
      await DriveClient.uploadFile(token, folderId, item.filename, item.content, 'application/json')
      succeeded++
      // Successful uploads drop out of the queue.
    } catch {
      const retryCount = item.retryCount + 1
      next.push({
        ...item,
        retryCount,
        lastAttemptAt: Date.now(),
        status: retryCount >= MAX_RETRIES ? 'failed' : 'pending',
      })
    }
  }

  save(next)
  return {
    succeeded,
    failed:  next.filter(i => i.status === 'failed').length,
    skipped,
  }
}
