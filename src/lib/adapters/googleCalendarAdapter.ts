// Real Google Calendar API v3 adapter.
// Base URL: https://www.googleapis.com/calendar/v3

import type { CalendarEvent, CalendarAdapter } from '../calendarClient'
import { CalendarError } from '../calendarClient'

const BASE_URL = 'https://www.googleapis.com/calendar/v3'

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function checkStatus(resp: Response, op: string): Promise<void> {
  if (resp.ok) return
  const text = await resp.text().catch(() => '')
  if (resp.status === 401) throw new CalendarError('Auth required', 'AUTH_REQUIRED')
  if (resp.status === 429) throw new CalendarError('Quota exceeded', 'QUOTA_EXCEEDED')
  if (resp.status === 404) throw new CalendarError('Not found', 'NOT_FOUND')
  if (resp.status === 412) throw new CalendarError('ETag conflict', 'CONFLICT')
  throw new CalendarError(`${op} failed (${resp.status}): ${text.slice(0, 200)}`, 'UNKNOWN')
}

export const googleCalendarAdapter: CalendarAdapter = {

  async getCalendarList(token) {
    const resp = await fetch(
      `${BASE_URL}/users/me/calendarList?fields=items(id,summary)&maxResults=250`,
      { headers: auth(token) },
    )
    await checkStatus(resp, 'getCalendarList')
    const data = await resp.json() as { items?: Array<{ id: string; summary: string }> }
    return data.items ?? []
  },

  async createCalendar(token, name) {
    const resp = await fetch(`${BASE_URL}/calendars`, {
      method:  'POST',
      headers: auth(token),
      body:    JSON.stringify({
        summary:     name,
        description: 'Managed by Property Manager app. Do not edit manually.',
      }),
    })
    await checkStatus(resp, 'createCalendar')
    const cal = await resp.json() as { id: string }
    return { id: cal.id }
  },

  async listEvents(token, calendarId) {
    const url = new URL(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('privateExtendedProperty', 'source=PropertyManager')
    url.searchParams.set('fields', 'items(id,summary,description,start,end,etag,updated,extendedProperties)')
    url.searchParams.set('maxResults', '500')
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('timeMin', new Date().toISOString())

    const resp = await fetch(url.toString(), { headers: auth(token) })
    if (resp.status === 404) return []  // calendar deleted
    await checkStatus(resp, 'listEvents')

    const data = await resp.json() as {
      items?: Array<{
        id: string; summary: string; description?: string
        start: { date?: string }; end: { date?: string }
        etag: string; updated: string
        extendedProperties?: { private?: Record<string, string> }
      }>
    }

    return (data.items ?? []).map(item => ({
      id:          item.id,
      calendarId,
      summary:     item.summary,
      description: item.description ?? '',
      start:       { date: item.start.date ?? '' },
      end:         { date: item.end.date ?? item.start.date ?? '' },
      reminders:   [],
      updated:     item.updated,
      etag:        item.etag,
    })) satisfies CalendarEvent[]
  },

  async createEvent(token, calendarId, event) {
    const resp = await fetch(
      `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', headers: auth(token), body: JSON.stringify(event) },
    )
    await checkStatus(resp, 'createEvent')
    const created = await resp.json() as { id: string; etag: string; updated: string; summary: string; description: string; start: { date: string }; end: { date: string } }
    return {
      id:          created.id,
      calendarId,
      summary:     created.summary,
      description: created.description ?? '',
      start:       created.start,
      end:         created.end,
      reminders:   [],
      updated:     created.updated,
      etag:        created.etag,
    }
  },

  async updateEvent(token, calendarId, eventId, event, ifMatchEtag) {
    const headers: Record<string, string> = auth(token)
    if (ifMatchEtag) headers['If-Match'] = ifMatchEtag

    const resp = await fetch(
      `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'PATCH', headers, body: JSON.stringify(event) },
    )
    if (resp.status === 404) throw new CalendarError('Event not found', 'NOT_FOUND')
    await checkStatus(resp, 'updateEvent')
    const updated = await resp.json() as { id: string; etag: string; updated: string; summary: string; description: string; start: { date: string }; end: { date: string } }
    return {
      id:          updated.id,
      calendarId,
      summary:     updated.summary,
      description: updated.description ?? '',
      start:       updated.start,
      end:         updated.end,
      reminders:   [],
      updated:     updated.updated,
      etag:        updated.etag,
    }
  },

  async deleteEvent(token, calendarId, eventId) {
    const resp = await fetch(
      `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    // 404 / 410 / 204 — all acceptable
    if (resp.status === 404 || resp.status === 410 || resp.status === 204) return
    await checkStatus(resp, 'deleteEvent')
  },
}
