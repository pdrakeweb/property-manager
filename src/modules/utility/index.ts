/**
 * `utility` module — utility account + monthly bill tracking with usage
 * trends across electric, gas, water, sewer, trash, internet, and phone
 * providers.
 *
 * Phase 1/2 contract: registered but not rendered. Future phases consume
 * `routes` / `navItems` to drive the UI from the active module set.
 */

import { createElement, lazy } from 'react'
import { Zap } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { UtilityAccountZ } from '@/records/utilityAccount'
import { UtilityBillZ }    from '@/records/utilityBill'

const UtilityScreen = lazy(() =>
  import('@/screens/UtilityScreen').then(m => ({ default: m.UtilityScreen })),
)

export const UtilityModule: ModuleDefinition = {
  id:          'utility',
  name:        'Utility',
  description:
    'Track utility providers and monthly bills (electric, gas, water, sewer, trash, internet, phone). Surfaces consumption trends and cost-per-unit comparisons over time.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '⚡',
  capabilities: [
    'Utility bill tracking',
    'Usage trends',
    'Provider management',
  ],

  // Two well-known route paths in the codebase point at this screen
  // (`/utility` and `/utilities`); the module declares the canonical one
  // and AppShell continues to wire `/utilities` until the route block
  // becomes module-driven.
  routes: [
    { path: '/utilities', element: createElement(UtilityScreen) },
  ],

  navItems: [
    { label: 'Utility', path: '/utilities', icon: Zap, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'utility_account', schema: UtilityAccountZ, syncable: true },
    { typeName: 'utility_bill',    schema: UtilityBillZ,    syncable: true },
  ],
}

export default UtilityModule
