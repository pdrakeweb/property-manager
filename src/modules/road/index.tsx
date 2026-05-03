/**
 * `road` module — driveway / private road maintenance log.
 *
 * Phase 2 contract: declared and registered, but the host's static routes
 * and nav in `App.tsx` / `AppShell.tsx` continue to drive the live UI.
 */

import { lazy } from 'react'
import { MapPin } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { RoadEventZ } from '@/records/road'

const RoadScreen = lazy(() =>
  import('@/screens/RoadScreen').then(m => ({ default: m.RoadScreen })),
)

export const RoadModule: ModuleDefinition = {
  id:          'road',
  name:        'Road',
  description:
    'Log driveway and private-road maintenance events — gravel deliveries, grading, snow removal, and culvert work — with running cost history.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '🛣',
  capabilities: [
    'Road maintenance log',
    'Gravel delivery tracking',
    'Cost history',
  ],

  routes: [
    { path: '/road', element: <RoadScreen /> },
  ],

  navItems: [
    { label: 'Road', path: '/road', icon: MapPin, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'road', schema: RoadEventZ, syncable: true },
  ],
}

export default RoadModule
