// Calendar sync logic — no Claude dependency.
// Reads task records from localIndex, pushes to Google Calendar API.

import { calendarClient }  from './calendarClient'
import { localIndex }       from './localIndex'
import type { IndexRecord } from './localIndex'
import { expandRecurring }  from './seasonDates'
import { isDev }            from '../auth/oauth'
import { PROPERTIES }       from '../data/mockData'
import type { MaintenanceTask } from '../types'

function getPropertyName(propertyId: string): string {
  return PROPERTIES.find(p => p.id === propertyId)?.name ?? propertyId
}

function taskFromRecord(record: IndexRecord): MaintenanceTask | null {
  if (record.type !== 'task') return null
  return record.data as unknown as MaintenanceTask
}

function appUrl(): string {
  return window.location.origin + '/#/maintenance'
}

// ── Single task sync ──────────────────────────────────────────────────────────

/**
 * Create or update a calendar event for a single task record.
 * For recurring tasks, creates one event per upcoming occurrence.
 */
export async function syncTaskToCalendar(
  token:        string,
  record:       IndexRecord,
  propertyName: string,
): Promise<void> {
  if (isDev()) return   // Calendar API requires real OAuth token

  const task = taskFromRecord(record)
  if (!task) return
  if (task.status === 'completed') return

  const baseDate = task.dueDate
  if (!baseDate) return

  // Build the set of dates to create events for
  const recurrence = task.recurrence ?? ''
  const dates: string[] = recurrence
    ? expandRecurring(baseDate, recurrence, 12)
    : [baseDate]

  if (dates.length === 0) return

  const input = {
    taskId:         record.id,
    title:          task.title,
    propertyName,
    category:       task.systemLabel ?? task.categoryId,
    dueDate:        dates[0],   // primary event uses first date
    estimatedCost:  task.estimatedCost,
    notes:          task.notes,
    appUrl:         appUrl(),
  }

  if (record.calendarEventId) {
    // Update existing event with the current primary date
    await calendarClient.updateEvent(token, record.calendarEventId, input)
  } else {
    // Create primary event and store the ID
    const eventId = await calendarClient.createEvent(token, input)
    localIndex.markCalendarSynced(record.id, eventId)

    // Create additional recurrence events (no ID stored — they're ephemeral reminders)
    for (const date of dates.slice(1)) {
      await calendarClient.createEvent(token, { ...input, dueDate: date })
    }
  }
}

// ── Bulk sync ─────────────────────────────────────────────────────────────────

export interface CalendarSyncResult {
  synced:  number   // new events created
  updated: number   // existing events patched
  skipped: number   // completed, deleted, or no date
}

/**
 * Sync all upcoming tasks for a property to Google Calendar.
 * Returns counts for toast notification.
 */
export async function syncAllToCalendar(
  token:      string,
  propertyId: string,
): Promise<CalendarSyncResult> {
  if (isDev()) {
    return { synced: 0, updated: 0, skipped: 0 }
  }

  const propertyName = getPropertyName(propertyId)
  const records      = localIndex.getAll('task', propertyId)

  let synced  = 0
  let updated = 0
  let skipped = 0

  for (const record of records) {
    const task = taskFromRecord(record)
    if (!task || task.status === 'completed' || !task.dueDate) {
      skipped++
      continue
    }

    try {
      const hadEventId = !!record.calendarEventId
      await syncTaskToCalendar(token, record, propertyName)
      if (hadEventId) updated++
      else synced++
    } catch {
      skipped++
    }
  }

  return { synced, updated, skipped }
}

// ── Remove from calendar ──────────────────────────────────────────────────────

/**
 * Delete the calendar event for a completed or deleted task.
 * No-op if the task has no calendarEventId or if in dev mode.
 */
export async function removeTaskFromCalendar(
  token:  string,
  record: IndexRecord,
): Promise<void> {
  if (isDev()) return
  if (!record.calendarEventId) return

  try {
    await calendarClient.deleteEvent(token, record.calendarEventId)
  } catch {
    // Non-fatal — event may have already been deleted
  }
}
