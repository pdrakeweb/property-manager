/**
 * `well` module — well water test records and quality tracking.
 *
 * Phase 2 contract: declared and registered, but the host's static routes
 * and nav in `App.tsx` / `AppShell.tsx` continue to drive the live UI.
 */

import { lazy } from 'react'
import { FlaskConical } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { WellTestZ } from '@/records/wellTest'

const WellTestScreen = lazy(() =>
  import('@/screens/WellTestScreen').then(m => ({ default: m.WellTestScreen })),
)

export const WellModule: ModuleDefinition = {
  id:          'well',
  name:        'Well',
  description:
    'Record annual well water tests with parameter results, lab references, and trend history for bacteria, nitrates, and hardness.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '🚰',
  capabilities: [
    'Well test records',
    'Water quality tracking',
    'Test history',
  ],

  routes: [
    { path: '/well', element: <WellTestScreen /> },
  ],

  navItems: [
    { label: 'Well', path: '/well', icon: FlaskConical, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'well_test', schema: WellTestZ, syncable: true },
  ],
}

export default WellModule
