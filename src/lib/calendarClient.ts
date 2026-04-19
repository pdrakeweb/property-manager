// Adapter router + types for Google Calendar integration.
// Routes between googleCalendarAdapter (prod) and localCalendarAdapter (dev bypass).

import { isDev } from '../auth/oauth'
import { localIndex, type IndexRecord } from './localIndex'
import { reconcileCalendar } from './calendarReconciliation'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id:          string
  calendarId:  string
  summary:     string
  description: string
  start:       { date: string }
  end:         { date: string }
  reminders:   Array<{ type: 'popup'; minutes: number }>
  updated:     string
  etag:        string
}

export interface ExpectedCalendarEvent {
  taskId:      string
  taskTitle:   string
  date:        string
  description: string
  reminders:   Array<{ type: 'popup'; minutes: number }>
}

export interface DryRunResult {
  toCreate: Array<{ taskId: string; event: Partial<CalendarEvent> }>
  toUpdate: Array<{ taskId: string; existing: CalendarEvent; replacement: Partial<CalendarEvent>; reason: string }>
  toDelete: Array<{ eventId: string; reason: string }>
  summary:  { willCreate: number; willUpdate: number; willDelete: number }
}

export interface CalendarSyncResult {
  created: number
  updated: number
  deleted: number
  errors:  Array<{ op: string; taskId?: string; message: string }>
}

export interface PropertyCalendarMetadata {
  propertyId:   string
  calendarId:   string
  calendarName: string
  created:      string
  verified:     string
}

export class CalendarError extends Error {
  constructor(
    message: string,
    public code: 'AUTH_REQUIRED' | 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'CONFLICT' | 'NETWORK' | 'OFFLINE' | 'UNKNOWN',
  ) {
    super(message)
    this.name = 'CalendarError'
  }
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface CalendarAdapter {
  getCalendarList(token: string): Promise<Array<{ id: string; summary: string }>>
  createCalendar(token: string, name: string): Promise<{ id: string }>
  listEvents(token: string, calendarId: string): Promise<CalendarEvent[]>
  createEvent(token: string, calendarId: string, event: Partial<CalendarEvent> & Record<string, unknown>): Promise<CalendarEvent>
  updateEvent(token: string, calendarId: string, eventId: string, event: Partial<CalendarEvent> & Record<string, unknown>, ifMatchEtag?: string): Promise<CalendarEvent>
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>
}

// ── Adapter routing ───────────────────────────────────────────────────────────

async function getAdapter(): Promise<CalendarAdapter> {
  if (isDev()) {
    const { localCalendarAdapter } = await import('./adapters/localCalendarAdapter')
    return localCalendarAdapter
  }
  const { googleCalendarAdapter } = await import('./adapters/googleCalendarAdapter')
  return googleCalendarAdapter
}

// ── Calendar name prefix ──────────────────────────────────────────────────────

const CAL_PREFIX = 'Property Manager — '

function calendarName(propertyName: string): string {
  return `${CAL_PREFIX}${propertyName}`
}

// ── High-level API ────────────────────────────────────────────────────────────

import { getCachedCalendarId, setCachedCalendarId } from './calendarStorage'

/**
 * Get or create the dedicated calendar for a property.
 * Verifies the cached calendar ID still exists before returning it.
 */
export async function getOrCreatePropertyCalendar(
  token:        string,
  propertyId:   string,
  propertyName: string,
): Promise<PropertyCalendarMetadata> {
  const adapter = await getAdapter()
  const name    = calendarName(propertyName)
  const now     = new Date().toISOString()

  // Try cache first
  const cachedId = getCachedCalendarId(propertyId)
  if (cachedId) {
    try {
      const list = await adapter.getCalendarList(token)
      if (list.some(c => c.id === cachedId)) {
        const meta: PropertyCalendarMetadata = {
          propertyId, calendarId: cachedId, calendarName: name,
          created: now, verified: now,
        }
        setCachedCalendarId(propertyId, meta)
        return meta
      }
    } catch {
      // Network error — trust cache
      return { propertyId, calendarId: cachedId, calendarName: name, created: now, verified: now }
    }
  }

  // Check if calendar already exists under a different cached key
  const list = await adapter.getCalendarList(token)
  const existing = list.find(c => c.summary === name)
  if (existing) {
    const meta: PropertyCalendarMetadata = {
      propertyId, calendarId: existing.id, calendarName: name, created: now, verified: now,
    }
    setCachedCalendarId(propertyId, meta)
    return meta
  }

  // Create new
  const created = await adapter.createCalendar(token, name)
  const meta: PropertyCalendarMetadata = {
    propertyId, calendarId: created.id, calendarName: name, created: now, verified: now,
  }
  setCachedCalendarId(propertyId, meta)
  return meta
}

/**
 * Sync all tasks for a property to their calendar.
 * Pass dryRun=true to preview the diff without making API calls.
 */
export async function syncAllToCalendar(
  token:        string,
  propertyId:   string,
  propertyName: string,
  dryRun        = false,
): Promise<CalendarSyncResult | DryRunResult> {
  const meta       = await getOrCreatePropertyCalendar(token, propertyId, propertyName)
  const tasks      = localIndex.getAll('task', propertyId)
  return reconcileCalendar(token, meta.calendarId, tasks, propertyName, dryRun)
}

/**
 * Add (or update) a single task's calendar event.
 */
export async function addTaskToCalendar(
  token:        string,
  task:         IndexRecord,
  propertyName: string,
): Promise<void> {
  const data      = task.data as Record<string, unknown>
  const propertyId = task.propertyId
  const status    = (data['status'] as string | undefined) ?? ''
  if (status === 'completed') return

  const meta = await getOrCreatePropertyCalendar(token, propertyId, propertyName)
  await reconcileCalendar(token, meta.calendarId, [task], propertyName, false)
}

/**
 * Remove a task's calendar event(s).
 */
export async function removeTaskFromCalendar(
  token: string,
  task:  IndexRecord,
): Promise<void> {
  const adapter    = await getAdapter()
  const propertyId = task.propertyId
  const cachedId   = getCachedCalendarId(propertyId)
  if (!cachedId) return

  const calendarEventIds = task.calendarEventIds ?? (task.calendarEventId ? [task.calendarEventId] : [])
  for (const eventId of calendarEventIds) {
    try { await adapter.deleteEvent(token, cachedId, eventId) } catch { /* non-fatal */ }
  }
}
