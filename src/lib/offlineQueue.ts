// Offline upload queue backed by localStorage.
// Entries are persisted across page reloads and retried when connectivity returns.

export interface QueuedUpload {
  id:            string
  categoryId:    string
  rootFolderId:  string
  filename:      string
  mdContent:     string
  capturedAt:    string
  enqueuedAt:    string
}

const QUEUE_KEY = 'property_manager_offline_queue'

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
  })
  save(queue)
}

/** How many uploads are waiting */
export function getQueueCount(): number {
  return load().length
}

/** Attempt to upload all queued items. Items that fail remain in the queue. */
export async function retryAll(getToken: () => Promise<string | null>): Promise<{ succeeded: number; failed: number }> {
  // Lazy import to avoid circular dependency
  const { DriveClient } = await import('./driveClient')

  const queue:     QueuedUpload[] = load()
  const remaining: QueuedUpload[] = []
  let succeeded = 0

  for (const item of queue) {
    try {
      const token = await getToken()
      if (!token) { remaining.push(item); continue }

      const folderId = await DriveClient.resolveFolderId(token, item.categoryId, item.rootFolderId)
      await DriveClient.uploadFile(token, folderId, item.filename, item.mdContent, 'text/markdown')
      succeeded++
    } catch {
      remaining.push(item)
    }
  }

  save(remaining)
  return { succeeded, failed: remaining.length }
}
