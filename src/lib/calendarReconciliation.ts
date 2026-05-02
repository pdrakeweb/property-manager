// Full reconciliation algorithm: diff existing calendar events vs expected,
// then create/update/delete as needed (or return a dry-run preview).

import type { CalendarEvent, CalendarSyncResult, DryRunResult, CalendarAdapter } from './calendarClient'
import { CalendarError } from './calendarClient'
import { isDev } from '../auth/oauth'
import { localIndex } from './localIndex'
import type { IndexRecord } from './localIndex'
import { expandTaskToDates, buildEventDescription, parseTaskIdFromDescription } from './calendarExpansion'

async function getAdapter(): Promise<CalendarAdapter> {
  if (isDev()) {
    const { localCalendarAdapter } = await import('./adapters/localCalendarAdapter')
    return localCalendarAdapter
  }
  const { googleCalendarAdapter } = await import('./adapters/googleCalendarAdapter')
  return googleCalendarAdapter
}

function buildEventBody(task: IndexRecord, propertyName: string, date: string): Record<string, unknown> {
  const data = task.data as Record<string, unknown>
  return {
    summary:     `${String(data['title'] ?? task.title)} — ${propertyName}`,
    description: buildEventDescription(task, propertyName),
    start:       { date },
    end:         { date },
    reminders:   { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    extendedProperties: {
      private: {
        source:     'PropertyManager',
        taskId:     task.id,
        propertyId: task.propertyId,
      },
    },
  }
}

export async function reconcileCalendar(
  token:        string,
  calendarId:   string,
  tasks:        IndexRecord[],
  propertyName: string,
  dryRun:       boolean,
): Promise<CalendarSyncResult | DryRunResult> {
  const adapter = await getAdapter()

  // 1. Fetch existing events
  let existingEvents: CalendarEvent[] = []
  try {
    existingEvents = await adapter.listEvents(token, calendarId)
  } catch {
    // If listing fails, proceed with empty — creates will handle it
  }

  // 2. Group existing events by taskId (parsed from description)
  const existingByTask = new Map<string, CalendarEvent[]>()
  const orphans: CalendarEvent[] = []

  for (const event of existingEvents) {
    const taskId = parseTaskIdFromDescription(event.description)
    if (!taskId) {
      orphans.push(event)
      continue
    }
    const group = existingByTask.get(taskId) ?? []
    group.push(event)
    existingByTask.set(taskId, group)
  }

  // 3. Build expected map: taskId → dates[]
  const expectedByTask = new Map<string, { task: IndexRecord; dates: string[] }>()
  for (const task of tasks) {
    const data   = task.data as Record<string, unknown>
    const status = (data['status'] as string | undefined) ?? ''
    if (task.deletedAt || status === 'completed') continue
    const dates = expandTaskToDates(task)
    if (dates.length === 0) continue
    expectedByTask.set(task.id, { task, dates })
  }

  // 4. Diff
  if (dryRun) {
    const toCreate: DryRunResult['toCreate'] = []
    const toUpdate: DryRunResult['toUpdate'] = []
    const toDelete: DryRunResult['toDelete'] = []

    for (const [taskId, { task, dates }] of expectedByTask) {
      const existing = existingByTask.get(taskId) ?? []
      const data     = task.data as Record<string, unknown>
      const title    = `${String(data['title'] ?? task.title)} — ${propertyName}`

      if (existing.length === 0) {
        for (const date of dates) {
          toCreate.push({ taskId, event: buildEventBody(task, propertyName, date) as Partial<CalendarEvent> })
        }
      } else {
        // Check if primary event needs update
        const primary = existing[0]
        if (primary.start.date !== dates[0] || primary.summary !== title) {
          toUpdate.push({
            taskId,
            existing: primary,
            replacement: buildEventBody(task, propertyName, dates[0]) as Partial<CalendarEvent>,
            reason: primary.start.date !== dates[0]
              ? `date: ${primary.start.date} → ${dates[0]}`
              : 'title changed',
          })
        }
        // Extra occurrences
        for (let i = 1; i < dates.length; i++) {
          if (!existing[i]) {
            toCreate.push({ taskId, event: buildEventBody(task, propertyName, dates[i]) as Partial<CalendarEvent> })
          } else if (existing[i].start.date !== dates[i]) {
            toUpdate.push({
              taskId,
              existing:    existing[i],
              replacement: buildEventBody(task, propertyName, dates[i]) as Partial<CalendarEvent>,
              reason:      `date: ${existing[i].start.date} → ${dates[i]}`,
            })
          }
        }
        // Stale extras
        for (const stale of existing.slice(dates.length)) {
          toDelete.push({ eventId: stale.id, reason: 'stale recurrence occurrence' })
        }
      }
    }

    // Deletes for tasks no longer expected
    for (const [taskId, events] of existingByTask) {
      if (!expectedByTask.has(taskId)) {
        for (const event of events) {
          toDelete.push({ eventId: event.id, reason: 'task completed or removed' })
        }
      }
    }
    for (const orphan of orphans) {
      toDelete.push({ eventId: orphan.id, reason: 'orphaned event (no task ID)' })
    }

    return {
      toCreate, toUpdate, toDelete,
      summary: { willCreate: toCreate.length, willUpdate: toUpdate.length, willDelete: toDelete.length },
    }
  }

  // 5. Execute
  const result: CalendarSyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }

  for (const [taskId, { task, dates }] of expectedByTask) {
    const existing = existingByTask.get(taskId) ?? []
    const data     = task.data as Record<string, unknown>
    const title    = `${String(data['title'] ?? task.title)} — ${propertyName}`

    if (existing.length === 0) {
      const eventIds: string[] = []
      for (const date of dates) {
        try {
          const created = await adapter.createEvent(token, calendarId, buildEventBody(task, propertyName, date))
          eventIds.push(created.id)
          result.created++
        } catch (err) {
          result.errors.push({ op: 'create', taskId, message: String(err) })
        }
      }
      if (eventIds.length > 0) {
        localIndex.markCalendarSynced(task.id, eventIds)
      }
    } else {
      // Update primary
      const primary = existing[0]
      if (primary.start.date !== dates[0] || primary.summary !== title) {
        try {
          await adapter.updateEvent(token, calendarId, primary.id, buildEventBody(task, propertyName, dates[0]), primary.etag)
          result.updated++
        } catch (err) {
          if (err instanceof CalendarError && err.code === 'CONFLICT') {
            // Re-fetch and retry once without etag check
            try {
              await adapter.updateEvent(token, calendarId, primary.id, buildEventBody(task, propertyName, dates[0]))
              result.updated++
            } catch (retryErr) {
              result.errors.push({ op: 'update', taskId, message: String(retryErr) })
            }
          } else {
            result.errors.push({ op: 'update', taskId, message: String(err) })
          }
        }
      }

      // Extra occurrences
      const newEventIds: string[] = [primary.id]
      for (let i = 1; i < dates.length; i++) {
        if (!existing[i]) {
          try {
            const created = await adapter.createEvent(token, calendarId, buildEventBody(task, propertyName, dates[i]))
            newEventIds.push(created.id)
            result.created++
          } catch (err) {
            result.errors.push({ op: 'create', taskId, message: String(err) })
          }
        } else {
          newEventIds.push(existing[i].id)
          if (existing[i].start.date !== dates[i]) {
            try {
              await adapter.updateEvent(token, calendarId, existing[i].id, buildEventBody(task, propertyName, dates[i]), existing[i].etag)
              result.updated++
            } catch {
              result.errors.push({ op: 'update', taskId, message: 'date update failed' })
            }
          }
        }
      }

      // Stale extras
      for (const stale of existing.slice(dates.length)) {
        try {
          await adapter.deleteEvent(token, calendarId, stale.id)
          result.deleted++
        } catch {
          result.errors.push({ op: 'delete', taskId, message: 'stale extra delete failed' })
        }
      }

      localIndex.markCalendarSynced(task.id, newEventIds)
    }
  }

  // Delete events for tasks no longer expected
  for (const [taskId, events] of existingByTask) {
    if (!expectedByTask.has(taskId)) {
      for (const event of events) {
        try {
          await adapter.deleteEvent(token, calendarId, event.id)
          result.deleted++
        } catch {
          result.errors.push({ op: 'delete', taskId, message: 'orphan delete failed' })
        }
      }
    }
  }
  for (const orphan of orphans) {
    try {
      await adapter.deleteEvent(token, calendarId, orphan.id)
      result.deleted++
    } catch { /* non-fatal */ }
  }

  return result
}
