/**
 * `insurance` module — policy tracking + renewal alerts.
 *
 * Phase 2 contract: declared but not yet rendered. The `/insurance` route
 * and the "Insurance" sidebar entry continue to live in `App.tsx` /
 * `AppShell.tsx` until the module-driven UI lands.
 */

import { lazy } from 'react'
import { Shield } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { InsurancePolicyZ } from '@/records/insurance'

const InsuranceScreen = lazy(() =>
  import('@/screens/InsuranceScreen').then(m => ({ default: m.InsuranceScreen })),
)

export const InsuranceModule: ModuleDefinition = {
  id:          'insurance',
  name:        'Insurance',
  description:
    'Track homeowners, flood, umbrella, and equipment policies. Captures coverage, renewal dates, and agent contacts; AI extracts new policies from declarations pages.',
  version:     '1.0.0',
  category:    'finance',
  icon:        '🛡️',
  capabilities: [
    'Policy tracking',
    'Expiry alerts',
    'Document capture',
    'AI extraction',
  ],

  routes: [
    { path: '/insurance', element: <InsuranceScreen /> },
  ],

  navItems: [
    { label: 'Insurance', path: '/insurance', icon: Shield, group: 'finance' },
  ],

  recordTypes: [
    { typeName: 'insurance', schema: InsurancePolicyZ, syncable: true },
  ],
}

export default InsuranceModule
