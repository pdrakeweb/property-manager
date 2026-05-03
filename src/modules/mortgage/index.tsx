/**
 * `mortgage` module — loan + amortization tracking.
 *
 * Phase 2 contract: declared but not yet rendered. The `/mortgage` route
 * and the "Mortgage" sidebar entry continue to live in `App.tsx` /
 * `AppShell.tsx` until the module-driven UI lands.
 */

import { lazy } from 'react'
import { Home } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { MortgageZ } from '@/records/mortgage'

const MortgageScreen = lazy(() =>
  import('@/screens/MortgageScreen').then(m => ({ default: m.MortgageScreen })),
)

export const MortgageModule: ModuleDefinition = {
  id:          'mortgage',
  name:        'Mortgage',
  description:
    'Track mortgages and HELOCs with amortization schedules, payment history, and an extra-payment simulator that estimates time and interest saved.',
  version:     '1.0.0',
  category:    'finance',
  icon:        '🏦',
  capabilities: [
    'Mortgage tracking',
    'Payment history',
    'Extra payment simulator',
    'Amortization',
  ],

  routes: [
    { path: '/mortgage', element: <MortgageScreen /> },
  ],

  navItems: [
    { label: 'Mortgage', path: '/mortgage', icon: Home, group: 'finance' },
  ],

  recordTypes: [
    { typeName: 'mortgage', schema: MortgageZ, syncable: true },
  ],
}

export default MortgageModule
