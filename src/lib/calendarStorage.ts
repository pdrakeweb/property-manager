// localStorage helpers for calendar sync state and offline queue.

import type { PropertyCalendarMetadata } from './calendarClient'

const CALENDARS_KEY = 'pm_calendars_v1'
const QUEUE_KEY     = 'pm_calendar_queue_v1'

// ── Property calendar cache ───────────────────────────────────────────────────

export function getPropertyCalendarCache(): Record<string, PropertyCalendarMetadata> {
  try {
    return JSON.parse(localStorage.getItem(CALENDARS_KEY) ?? '{}') as Record<string, PropertyCalendarMetadata>
  } catch {
    return {}
  }
}

export function setPropertyCalendarCache(cache: Record<string, PropertyCalendarMetadata>): void {
  localStorage.setItem(CALENDARS_KEY, JSON.stringify(cache))
}

export function getCachedCalendarId(propertyId: string): string | null {
  return getPropertyCalendarCache()[propertyId]?.calendarId ?? null
}

export function setCachedCalendarId(propertyId: string, meta: PropertyCalendarMetadata): void {
  const cache = getPropertyCalendarCache()
  cache[propertyId] = meta
  setPropertyCalendarCache(cache)
}

// ── Offline queue ─────────────────────────────────────────────────────────────

export interface QueueItem {
  op:         'create' | 'update' | 'delete'
  taskId:     string
  propertyId: string
  retries:    number
  queuedAt:   string
}

export function getCalendarQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueueItem[]
  } catch {
    return []
  }
}

export function addToCalendarQueue(item: Omit<QueueItem, 'retries' | 'queuedAt'>): void {
  const queue = getCalendarQueue()
  // De-duplicate: replace existing item for same taskId+op
  const idx = queue.findIndex(q => q.taskId === item.taskId && q.op === item.op)
  const entry: QueueItem = { ...item, retries: 0, queuedAt: new Date().toISOString() }
  if (idx >= 0) {
    queue[idx] = entry
  } else {
    queue.push(entry)
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function removeFromCalendarQueue(taskId: string, op: string): void {
  const queue = getCalendarQueue().filter(q => !(q.taskId === taskId && q.op === op))
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}
