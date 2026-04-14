// Dev-mode localStorage mock for Google Calendar.
// Implements CalendarAdapter exactly so code paths are identical to production.

import type { CalendarEvent, CalendarAdapter } from '../calendarClient'
import { CalendarError } from '../calendarClient'

const STORE_KEY = 'pm_dev_calendar_v1'

interface DevStore {
  calendars: Record<string, { id: string; summary: string }>
  events:    Record<string, Record<string, CalendarEvent & { etag: string }>>
  writeCount: number
}

function load(): DevStore {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as DevStore
      ?? { calendars: {}, events: {}, writeCount: 0 }
  } catch {
    return { calendars: {}, events: {}, writeCount: 0 }
  }
}

function save(store: DevStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

function nextEtag(store: DevStore): string {
  store.writeCount++
  return `v${store.writeCount}`
}

function devId(): string {
  return 'devcal_' + Math.random().toString(36).slice(2, 10)
}

export const localCalendarAdapter: CalendarAdapter = {

  async getCalendarList(_token) {
    const store = load()
    return Object.values(store.calendars)
  },

  async createCalendar(_token, name) {
    const store = load()
    const id = devId()
    store.calendars[id] = { id, summary: name }
    store.events[id]    = {}
    save(store)
    return { id }
  },

  async listEvents(_token, calendarId) {
    const store = load()
    const calEvents = store.events[calendarId]
    if (!calEvents) return []
    return Object.values(calEvents).filter(e => {
      try {
        const ext = (e as unknown as { extendedProperties?: { private?: { source?: string } } })
          .extendedProperties?.private
        return ext?.source === 'PropertyManager'
      } catch {
        return false
      }
    })
  },

  async createEvent(_token, calendarId, event) {
    const store = load()
    if (!store.events[calendarId]) store.events[calendarId] = {}
    const id = devId()
    const etag = nextEtag(store)
    const now = new Date().toISOString()
    const full: CalendarEvent & { etag: string } = {
      id,
      calendarId,
      summary:     event.summary     ?? '',
      description: event.description ?? '',
      start:       event.start       ?? { date: '' },
      end:         event.end         ?? event.start ?? { date: '' },
      reminders:   event.reminders   ?? [],
      updated:     now,
      etag,
      ...(event as Record<string, unknown>),  // carry extendedProperties etc.
    }
    store.events[calendarId][id] = full
    save(store)
    return full
  },

  async updateEvent(_token, calendarId, eventId, event, ifMatchEtag) {
    const store = load()
    const existing = store.events[calendarId]?.[eventId]
    if (!existing) throw new CalendarError('Event not found', 'NOT_FOUND')
    if (ifMatchEtag && existing.etag !== ifMatchEtag) {
      throw new CalendarError('ETag conflict', 'CONFLICT')
    }
    const etag = nextEtag(store)
    const updated: CalendarEvent & { etag: string } = {
      ...existing,
      ...(event as Partial<CalendarEvent>),
      id:       eventId,
      calendarId,
      updated:  new Date().toISOString(),
      etag,
    }
    store.events[calendarId][eventId] = updated
    save(store)
    return updated
  },

  async deleteEvent(_token, calendarId, eventId) {
    const store = load()
    if (!store.events[calendarId]) return  // 404 — silent
    delete store.events[calendarId][eventId]
    save(store)
  },
}
