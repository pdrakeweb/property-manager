/**
 * `permits` module — building / electrical / plumbing / well / septic permits.
 *
 * Phase 2 contract: declared and registered, but the host's static routes
 * and nav in `App.tsx` / `AppShell.tsx` continue to drive the live UI.
 * The activeIds-driven shell will pick this declaration up later.
 */

import { lazy } from 'react'
import { FileCheck } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { PermitZ } from '@/records/permit'

const PermitsScreen = lazy(() =>
  import('@/screens/PermitsScreen').then(m => ({ default: m.PermitsScreen })),
)

export const PermitsModule: ModuleDefinition = {
  id:          'permits',
  name:        'Permits',
  description:
    'Track building, electrical, plumbing, well, and septic permits — open inspections, expiry alerts, document attachments.',
  version:     '1.0.0',
  category:    'property',
  icon:        '📄',
  capabilities: [
    'Permit tracking',
    'Status management',
    'Document capture',
    'Expiry alerts',
  ],

  routes: [
    { path: '/permits', element: <PermitsScreen /> },
  ],

  navItems: [
    { label: 'Permits', path: '/permits', icon: FileCheck, group: 'property' },
  ],

  recordTypes: [
    { typeName: 'permit', schema: PermitZ, syncable: true },
  ],
}

export default PermitsModule
