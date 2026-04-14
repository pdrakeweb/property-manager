// Google Calendar API v3 — thin wrapper, no Claude dependency.
// All events are all-day events tagged with extendedProperties for filtering.

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const APP_SOURCE   = 'PropertyManager'

export interface CalendarTaskInput {
  taskId:         string
  title:          string
  propertyName:   string
  category:       string
  dueDate:        string   // YYYY-MM-DD
  estimatedCost?: number
  notes?:         string
  appUrl:         string   // link back into the app
}

interface CalendarEventBody {
  summary:     string
  description: string
  start:       { date: string }
  end:         { date: string }
  source:      { title: string; url: string }
  extendedProperties: {
    private: { propertyManagerId: string; taskId: string }
  }
}

function buildDescription(input: CalendarTaskInput): string {
  const lines: string[] = [
    `Property: ${input.propertyName}`,
    `Category: ${input.category}`,
  ]
  if (input.estimatedCost !== undefined) {
    lines.push(`Estimated cost: $${input.estimatedCost.toLocaleString()}`)
  }
  if (input.notes) {
    lines.push(`Notes: ${input.notes}`)
  }
  lines.push('', 'Managed by Property Manager — open app to update')
  return lines.join('\n')
}

function buildBody(input: CalendarTaskInput): CalendarEventBody {
  return {
    summary:     `${input.title} — ${input.propertyName}`,
    description: buildDescription(input),
    start:       { date: input.dueDate },
    end:         { date: input.dueDate },
    source:      { title: APP_SOURCE, url: input.appUrl },
    extendedProperties: {
      private: {
        propertyManagerId: APP_SOURCE,
        taskId:            input.taskId,
      },
    },
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export const calendarClient = {

  /** Create a new all-day event. Returns the created event ID. */
  async createEvent(token: string, task: CalendarTaskInput): Promise<string> {
    const resp = await fetch(CALENDAR_API, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify(buildBody(task)),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Calendar createEvent failed (${resp.status}): ${text.slice(0, 200)}`)
    }
    const event = await resp.json() as { id: string }
    return event.id
  },

  /** Patch an existing event's title, date, and description. */
  async updateEvent(token: string, eventId: string, task: CalendarTaskInput): Promise<void> {
    const resp = await fetch(`${CALENDAR_API}/${eventId}`, {
      method:  'PATCH',
      headers: authHeaders(token),
      body:    JSON.stringify(buildBody(task)),
    })
    if (resp.status === 404) return   // deleted externally — ignore
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Calendar updateEvent failed (${resp.status}): ${text.slice(0, 200)}`)
    }
  },

  /** Delete an event. 404 is silently ignored (already deleted). */
  async deleteEvent(token: string, eventId: string): Promise<void> {
    const resp = await fetch(`${CALENDAR_API}/${eventId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (resp.status === 404 || resp.status === 204) return
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Calendar deleteEvent failed (${resp.status}): ${text.slice(0, 200)}`)
    }
  },

  /**
   * List all events created by this app via extendedProperties filter.
   * Returns { taskId, eventId } pairs for cross-referencing with localIndex.
   */
  async listAppEvents(token: string): Promise<{ taskId: string; eventId: string }[]> {
    const url = new URL(CALENDAR_API)
    url.searchParams.set('privateExtendedProperty', `propertyManagerId=${APP_SOURCE}`)
    url.searchParams.set('fields', 'items(id,extendedProperties)')
    url.searchParams.set('maxResults', '500')
    url.searchParams.set('singleEvents', 'true')

    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Calendar listAppEvents failed (${resp.status}): ${text.slice(0, 200)}`)
    }

    const data = await resp.json() as {
      items?: Array<{
        id: string
        extendedProperties?: { private?: { taskId?: string } }
      }>
    }

    return (data.items ?? [])
      .filter(e => e.extendedProperties?.private?.taskId)
      .map(e => ({
        taskId:  e.extendedProperties!.private!.taskId!,
        eventId: e.id,
      }))
  },
}
