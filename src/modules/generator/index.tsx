/**
 * `generator` module — standby generator runtime, fuel, and service log.
 *
 * Phase 2 contract: declared and registered, but the host's static routes
 * and nav in `App.tsx` / `AppShell.tsx` continue to drive the live UI.
 *
 * Note: the underlying record type is `generator_log` in the DSL registry —
 * the module id is the shorter `generator`.
 */

import { lazy } from 'react'
import { Activity } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { GeneratorZ } from '@/records/generator'

const GeneratorScreen = lazy(() =>
  import('@/screens/GeneratorScreen').then(m => ({ default: m.GeneratorScreen })),
)

export const GeneratorModule: ModuleDefinition = {
  id:          'generator',
  name:        'Generator',
  description:
    'Log standby-generator run hours, fuel consumption, and service intervals so oil changes and load tests stay on schedule.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '⚡',
  capabilities: [
    'Generator run log',
    'Fuel consumption',
    'Service intervals',
  ],

  routes: [
    { path: '/generator', element: <GeneratorScreen /> },
  ],

  navItems: [
    { label: 'Generator', path: '/generator', icon: Activity, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'generator_log', schema: GeneratorZ, syncable: true },
  ],
}

export default GeneratorModule
