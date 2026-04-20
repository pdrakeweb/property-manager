# Google Calendar Integration + Reminder System
## System Design & Architecture Decision Record

**Status:** Implemented  
**Date:** 2026-04-14  
**Branch:** feature/phase-2

## Summary

Full Google Calendar integration for maintenance task reminders.
Per-property dedicated calendars, three-way reconciliation sync,
offline queue, dev-mode dry-run preview, no backend required.

## Key Decisions

- **Per-property calendars** named `[PM-{id}] {name}` — not primary calendar
- **Google Calendar as reminder delivery** — no push server, no FCM, no backend
- **Adapter pattern** — googleCalendarAdapter (prod) / localCalendarAdapter (dev bypass)
- **Reconciliation** — full create/update/delete diff on each sync
- **Recurring tasks** — expanded to 12-month occurrence windows, each as independent event
- **Seasonal tasks** — spring=Mar 20, summer=Jun 20, fall=Sep 22, winter=Dec 21
- **Dev dry-run** — DryRunModal shows full diff without calling Calendar API
- **Offline queue** — `pm_calendar_queue_v1`, flushed on reconnect via syncAll

## File Layout

```
src/lib/
  calendarClient.ts           # adapter router, types, high-level API
  calendarStorage.ts          # localStorage helpers (cache + offline queue)
  calendarExpansion.ts        # task → expected event dates
  calendarReconciliation.ts   # full create/update/delete diff algorithm
  adapters/
    googleCalendarAdapter.ts  # real Google Calendar API v3
    localCalendarAdapter.ts   # dev-mode mock (localStorage)

src/components/
  DryRunModal.tsx             # slide-up diff preview
  TaskCalendarChip.tsx        # per-task inline calendar state chip
```

## ADR-009: Google Calendar as Reminder Delivery

**Decision:** Use Google Calendar native notifications, not web push/FCM/Apps Script.

**Rationale:** App is a no-backend PWA on GitHub Pages. Push notifications require
a server to initiate the push. Google Calendar handles reminders natively on all
devices via the user's existing Google account. Adding `calendar.events` scope to
the existing OAuth flow has zero additional infrastructure cost.

**Alternatives considered:**
- Web Push + FCM: requires backend, VAPID key management, service worker subscription handling
- Google Apps Script cron: good option but requires a separate script deployment; adds ops surface
- Service worker local notifications: can't schedule future notifications without a push server
- Apple/Google calendar export (`.ics` file): read-only, no dynamic updates

**Consequences:**
- Reminders only work if user has Google Calendar notifications enabled on their devices
- User can customize reminder timing in Google Calendar UI (app respects their choice)
- Calendar events visible in Google Calendar across all devices automatically

## Reconciliation Algorithm

```
1. listEvents(calendarId) → existingEvents[]
2. Parse taskId from [PM:taskId=...] tag in each event description
3. Build expectedMap: taskId → date[] from expandTaskToDates()
4. Diff:
   - toCreate: tasks with no existing events
   - toUpdate: events where title or date changed
   - toDelete: events for completed/deleted tasks + orphans
5. dryRun=true → return diff without API calls
6. Execute creates/updates/deletes → update localIndex.calendarEventIds
```

## Storage Keys

| Key | Contents |
|-----|----------|
| `pm_calendars_v1` | `Record<propertyId, PropertyCalendarMetadata>` — calendar ID cache |
| `pm_calendar_queue_v1` | `QueueItem[]` — offline retry queue |
| `pm_dev_calendar_v1` | Dev-mode mock calendar state |
