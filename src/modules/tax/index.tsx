/**
 * `tax` module — property tax assessments + payment tracking.
 *
 * Phase 2 contract: declared but not yet rendered. The `/tax` route and
 * the "Property Tax" sidebar entry continue to live in `App.tsx` /
 * `AppShell.tsx` until the module-driven UI lands.
 *
 * Tax owns two record types — annual assessments and per-installment
 * payments — both registered here so module activation routes them
 * through the same Drive folder as the existing DSL definitions.
 */

import { lazy } from 'react'
import { Receipt } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { TaxAssessmentZ } from '@/records/taxAssessment'
import { TaxPaymentZ }    from '@/records/taxPayment'

const TaxScreen = lazy(() =>
  import('@/screens/TaxScreen').then(m => ({ default: m.TaxScreen })),
)

export const TaxModule: ModuleDefinition = {
  id:          'tax',
  name:        'Property Tax',
  description:
    'Track annual property tax assessments and per-installment payments. Captures bills via document upload and surfaces upcoming due dates.',
  version:     '1.0.0',
  category:    'finance',
  icon:        '🧾',
  capabilities: [
    'Property tax records',
    'Payment history',
    'Document capture',
  ],

  routes: [
    { path: '/tax', element: <TaxScreen /> },
  ],

  navItems: [
    { label: 'Property Tax', path: '/tax', icon: Receipt, group: 'finance' },
  ],

  recordTypes: [
    { typeName: 'tax_assessment', schema: TaxAssessmentZ, syncable: true },
    { typeName: 'tax_payment',    schema: TaxPaymentZ,    syncable: true },
  ],
}

export default TaxModule
