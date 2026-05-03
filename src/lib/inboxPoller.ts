/**
 * Drive inbox poller (Phase B of CONVERSATION-IMPORT-CONNECTOR-PLAN).
 *
 * Watches each property's `PropertyManager/<property>/inbox/` Drive folder
 * for new `.md` / `.txt` files, runs them through the existing
 * conversation-import pipeline, and queues the parsed result for the user
 * to review in the Import screen's Inbox tab.
 *
 * State (per property, in localStorage):
 *   pm_inbox_last_polled_<propertyId> — ISO timestamp of last successful poll
 *   pm_inbox_seen_<propertyId>        — JSON string[] of file IDs already
 *                                       processed (queued, committed, or
 *                                       dismissed). Acts as the dedupe key.
 *   pm_import_queue_<propertyId>      — JSON QueuedInboxItem[] awaiting
 *                                       review.
 *
 * On every queue mutation we dispatch a `pm-inbox-queue-changed` window
 * event so the AppShell badge can reactively refresh. Polling errors are
 * non-fatal and quietly logged — the inbox is convenience plumbing, not a
 * critical sync path.
 */

import { DriveClient } from './driveClient'
import { propertyStore } from './propertyStore'
import { parseConversation, type ImportPreview } from './conversationImport'

const KEY_LAST_POLLED = (propertyId: string) => `pm_inbox_last_polled_${propertyId}`
const KEY_SEEN_FILES  = (propertyId: string) => `pm_inbox_seen_${propertyId}`
const KEY_QUEUE       = (propertyId: string) => `pm_import_queue_${propertyId}`

export const INBOX_QUEUE_CHANGED_EVENT = 'pm-inbox-queue-changed'

export interface QueuedInboxItem extends ImportPreview {
  fileId:    string
  fileName:  string
  queuedAt:  string  // ISO 8601
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function emitQueueChanged(): void {
  window.dispatchEvent(new CustomEvent(INBOX_QUEUE_CHANGED_EVENT))
}

// ─── Public queue API (consumed by ImportScreen + AppShell badge) ─────────────

export function getInboxQueue(propertyId: string): QueuedInboxItem[] {
  return readJson<QueuedInboxItem[]>(KEY_QUEUE(propertyId), [])
}

export function getInboxQueueCount(propertyId: string): number {
  return getInboxQueue(propertyId).length
}

/** Total queued items across every known property. */
export function getTotalInboxQueueCount(): number {
  let total = 0
  for (const p of propertyStore.getAll()) {
    total += getInboxQueueCount(p.id)
  }
  return total
}

/**
 * Remove a queued item by file ID and add it to the seen set so the next
 * poll skips it. Used by both "approve & commit" and "dismiss" paths —
 * once the user has acted on a file we never resurface it.
 */
export function removeFromInboxQueue(propertyId: string, fileId: string): void {
  const queue = getInboxQueue(propertyId).filter(q => q.fileId !== fileId)
  writeJson(KEY_QUEUE(propertyId), queue)
  const seen = new Set(readJson<string[]>(KEY_SEEN_FILES(propertyId), []))
  seen.add(fileId)
  writeJson(KEY_SEEN_FILES(propertyId), Array.from(seen))
  emitQueueChanged()
}

/** Wipe a property's queue + seen set + cursor. Used by tests / dev tools. */
export function resetInbox(propertyId: string): void {
  localStorage.removeItem(KEY_QUEUE(propertyId))
  localStorage.removeItem(KEY_SEEN_FILES(propertyId))
  localStorage.removeItem(KEY_LAST_POLLED(propertyId))
  emitQueueChanged()
}

// ─── Polling ──────────────────────────────────────────────────────────────────

export interface PollInboxResult {
  propertyId:    string
  filesScanned:  number
  itemsQueued:   number
  filesSkipped:  number
  errors:        string[]
}

/**
 * Poll one property's inbox. Returns a summary even on partial failure;
 * never throws. Files that fail to parse are added to the seen set so
 * the user isn't re-prompted forever.
 */
export async function pollInbox(propertyId: string, token: string): Promise<PollInboxResult> {
  const result: PollInboxResult = {
    propertyId, filesScanned: 0, itemsQueued: 0, filesSkipped: 0, errors: [],
  }

  const property = propertyStore.getById(propertyId)
  if (!property?.driveRootFolderId) {
    result.errors.push('No Drive root folder configured for property')
    return result
  }

  const lastPolled = localStorage.getItem(KEY_LAST_POLLED(propertyId)) ?? ''
  const seen       = new Set(readJson<string[]>(KEY_SEEN_FILES(propertyId), []))
  const existing   = getInboxQueue(propertyId)
  const inQueue    = new Set(existing.map(q => q.fileId))

  let files: Awaited<ReturnType<typeof DriveClient.listInboxFiles>> = []
  try {
    files = await DriveClient.listInboxFiles(token, property.driveRootFolderId, lastPolled || undefined)
  } catch (err) {
    result.errors.push(`listInboxFiles: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }
  result.filesScanned = files.length

  let cursor = lastPolled
  const additions: QueuedInboxItem[] = []

  for (const file of files) {
    if (file.modifiedTime > cursor) cursor = file.modifiedTime
    if (seen.has(file.id) || inQueue.has(file.id)) {
      result.filesSkipped++
      continue
    }
    try {
      const content = await DriveClient.downloadInboxFile(token, file.id)
      const preview = await parseConversation(content)
      // Inbox files are scoped by the folder they live in — anything in
      // /<property>/inbox/ belongs to that property regardless of what
      // the frontmatter claims. This avoids silent writes to a phantom
      // propertyId when the file was generated for a different account.
      additions.push({
        ...preview,
        propertyId: propertyId,
        fileId:   file.id,
        fileName: file.name,
        queuedAt: new Date().toISOString(),
      })
      result.itemsQueued++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`${file.name}: ${msg}`)
      // Mark as seen so the user isn't re-prompted on every poll for the
      // same broken file. They can always re-upload to retry.
      seen.add(file.id)
    }
  }

  if (additions.length > 0) {
    writeJson(KEY_QUEUE(propertyId), [...existing, ...additions])
  }
  if (cursor && cursor !== lastPolled) {
    localStorage.setItem(KEY_LAST_POLLED(propertyId), cursor)
  }
  if (seen.size > 0) {
    writeJson(KEY_SEEN_FILES(propertyId), Array.from(seen))
  }
  if (additions.length > 0 || result.errors.length > 0) {
    emitQueueChanged()
  }
  return result
}

/** Convenience: poll every known property in sequence. */
export async function pollAllInboxes(token: string): Promise<PollInboxResult[]> {
  const results: PollInboxResult[] = []
  for (const p of propertyStore.getAll()) {
    if (!p.driveRootFolderId) continue
    results.push(await pollInbox(p.id, token))
  }
  return results
}
