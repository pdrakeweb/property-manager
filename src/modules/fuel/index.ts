/**
 * `fuel` module — propane / heating-oil / diesel / gasoline delivery
 * tracking with usage history and per-unit cost trends.
 *
 * Phase 1/2 contract: registered but not rendered. Future phases consume
 * `routes` / `navItems` to drive the UI from the active module set.
 */

import { createElement, lazy } from 'react'
import { Droplets } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { FuelDeliveryZ } from '@/records/fuelDelivery'

const FuelScreen = lazy(() =>
  import('@/screens/FuelScreen').then(m => ({ default: m.FuelScreen })),
)

export const FuelModule: ModuleDefinition = {
  id:          'fuel',
  name:        'Fuel',
  description:
    'Track propane, heating-oil, diesel, and gasoline deliveries. Captures gallons, price per gallon, vendor, and tank for usage history and cost trend analysis.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '⛽',
  capabilities: [
    'Fuel delivery tracking',
    'Usage history',
    'Cost per unit',
  ],

  routes: [
    { path: '/fuel', element: createElement(FuelScreen) },
  ],

  navItems: [
    { label: 'Fuel', path: '/fuel', icon: Droplets, group: 'systems' },
  ],

  recordTypes: [
    { typeName: 'fuel_delivery', schema: FuelDeliveryZ, syncable: true },
  ],
}

export default FuelModule
