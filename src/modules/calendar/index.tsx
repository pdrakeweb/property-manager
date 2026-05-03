/**
 * `calendar` module — Google-Calendar-backed view of upcoming maintenance,
 * with an iCal export path for users who don't want to grant Calendar API
 * access.
 *
 * Phase 2 contract: this declaration is REGISTERED but not yet rendered.
 * The existing static route/nav in `App.tsx` and `AppShell.tsx` continue
 * to drive the UI.
 *
 * Owned record types:
 *  - `calendar_metadata` — per-property cache of calendarId / calendarName
 *    and verification timestamps. Mirrors `PropertyCalendarMetadata` in
 *    `lib/calendarClient.ts`. The actual schedulable items are existing
 *    `task` records owned by the maintenance module.
 */

import { lazy } from 'react'
import { z } from 'zod'
import { CalendarDays } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'

const CalendarScreen = lazy(() =>
  import('@/screens/CalendarScreen').then(m => ({ default: m.CalendarScreen })),
)

// ── Calendar metadata schema ────────────────────────────────────────────────
//
// Mirrors `PropertyCalendarMetadata` in lib/calendarClient.ts so the
// module's recordTypes contribution is well-formed. The runtime store
// already persists these records under the legacy `pm_calendars_v1` key;
// declaring the schema here is documentary until the activeIds-driven
// vault registration goes live in a later phase.
const CalendarMetadataZ = z.object({
  propertyId:   z.string(),
  calendarId:   z.string(),
  calendarName: z.string(),
  created:      z.string(),
  verified:     z.string(),
})

export const CalendarModule: ModuleDefinition = {
  id:           'calendar',
  name:         'Calendar',
  description:
    'Visualises upcoming and overdue maintenance tasks on a month view, with optional Google Calendar sync and iCal export so reminders surface in the user\'s existing calendar app.',
  version:      '1.0.0',
  category:     'tools',
  icon:         '📅',
  // The calendar reads `task` records produced by the maintenance module —
  // it adds value when both are present but doesn't hard-require either
  // direction.
  enhances:     ['maintenance'],
  capabilities: [
    'Maintenance scheduling',
    'Task calendar view',
    'iCal export',
  ],

  routes: [
    { path: '/calendar', element: <CalendarScreen /> },
  ],

  navItems: [
    { label: 'Calendar', path: '/calendar', icon: CalendarDays, group: 'tools' },
  ],

  recordTypes: [
    { typeName: 'calendar_metadata', schema: CalendarMetadataZ, syncable: true },
  ],
}

export default CalendarModule
