/**
 * `capital` module — capital project planning + budget forecasting.
 *
 * Phase 2 contract: declared but not yet rendered. The `/budget` route and
 * the "Budget" sidebar entry continue to live in `App.tsx` / `AppShell.tsx`
 * until the module-driven UI lands.
 */

import { lazy } from 'react'
import { BarChart3 } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { CapitalItemZ } from '@/records/capitalItem'

const BudgetScreen = lazy(() =>
  import('@/screens/BudgetScreen').then(m => ({ default: m.BudgetScreen })),
)

export const CapitalModule: ModuleDefinition = {
  id:          'capital',
  name:        'Budget',
  description:
    'Plan capital projects and forecast multi-year spending. Tracks costs, priorities, and completion against estimates.',
  version:     '1.0.0',
  category:    'finance',
  icon:        '📊',
  capabilities: [
    'Capital project planning',
    'Budget forecasting',
    'Cost tracking',
    'Add/edit/delete projects',
  ],

  routes: [
    { path: '/budget', element: <BudgetScreen /> },
  ],

  navItems: [
    { label: 'Budget', path: '/budget', icon: BarChart3, group: 'finance' },
  ],

  recordTypes: [
    { typeName: 'capital_item', schema: CapitalItemZ, syncable: true },
  ],
}

export default CapitalModule
