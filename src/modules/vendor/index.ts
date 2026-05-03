/**
 * `vendor` module — contractor / service-provider directory cross-linked
 * to maintenance and capital-spend records via `vendorId`.
 *
 * Phase 1/2 contract: registered but not rendered. Future phases consume
 * `routes` / `navItems` to drive the UI from the active module set.
 */

import { createElement, lazy } from 'react'
import { Users } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { VendorZ } from '@/records/vendor'

const VendorScreen = lazy(() =>
  import('@/screens/VendorScreen').then(m => ({ default: m.VendorScreen })),
)

export const VendorModule: ModuleDefinition = {
  id:          'vendor',
  name:        'Vendors',
  description:
    'Contractor and service-provider directory with phone, email, license, rating, and per-property scoping. Each vendor surfaces the service history pulled from completed maintenance records linked by `vendorId`.',
  version:     '1.0.0',
  category:    'tools',
  icon:        '👷',
  capabilities: [
    'Contractor database',
    'Contact management',
    'Service history links',
  ],

  routes: [
    { path: '/vendors', element: createElement(VendorScreen) },
  ],

  navItems: [
    { label: 'Vendors', path: '/vendors', icon: Users, group: 'tools' },
  ],

  recordTypes: [
    { typeName: 'vendor', schema: VendorZ, syncable: true },
  ],
}

export default VendorModule
