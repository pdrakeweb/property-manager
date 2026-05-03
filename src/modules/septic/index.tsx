/**
 * `septic` module — septic system pump-outs and service history.
 *
 * Phase 2 contract: declared and registered, but the host's static routes
 * and nav in `App.tsx` / `AppShell.tsx` continue to drive the live UI.
 *
 * Note: the underlying record type is `septic_event` in the DSL registry —
 * the module id is the shorter `septic`.
 */

import { lazy } from 'react'
import { Droplets } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { SepticEventZ } from '@/records/septicEvent'

const SepticScreen = lazy(() =>
  import('@/screens/SepticScreen').then(m => ({ default: m.SepticScreen })),
)

export const SepticModule: ModuleDefinition = {
  id:          'septic',
  name:        'Septic',
  description:
    'Track septic system pump-outs, inspections, and field service so the next visit is on the calendar before the tank is full.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '🚽',
  capabilities: [
    'Septic system records',
    'Pump-out scheduling',
    'Service history',
  ],

  routes: [
    { path: '/septic-log', element: <SepticScreen /> },
  ],

  navItems: [
    { label: 'Septic', path: '/septic-log', icon: Droplets, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'septic_event', schema: SepticEventZ, syncable: true },
  ],
}

export default SepticModule
