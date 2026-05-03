/**
 * `inventory` module — equipment inventory + service history.
 *
 * Owns the `equipment` record type and the routes that capture, view,
 * edit, and inspect each piece of equipment (HVAC unit, water heater,
 * generator, etc.). Optionally links to Home Assistant entities for
 * live state.
 *
 * Phase 2 contract: declared but not yet rendered. The legacy static
 * routes in App.tsx still drive these paths until the active-modules
 * pipeline takes over the route table.
 */

import { lazy } from 'react'
import { ClipboardList } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { EquipmentZ } from '@/records/equipment'

const InventoryScreen = lazy(() =>
  import('@/screens/InventoryScreen').then(m => ({ default: m.InventoryScreen })),
)
const EquipmentDetailScreen = lazy(() =>
  import('@/screens/EquipmentDetailScreen').then(m => ({ default: m.EquipmentDetailScreen })),
)
const EquipmentFormScreen = lazy(() =>
  import('@/screens/EquipmentFormScreen').then(m => ({ default: m.EquipmentFormScreen })),
)
const InspectionScreen = lazy(() =>
  import('@/screens/InspectionScreen').then(m => ({ default: m.InspectionScreen })),
)

export const InventoryModule: ModuleDefinition = {
  id:          'inventory',
  name:        'Inventory',
  description:
    'Equipment inventory with service history, condition assessments, and optional Home Assistant entity linking.',
  version:     '1.0.0',
  category:    'property',
  icon:        '🧰',
  capabilities: [
    'Equipment tracking',
    'Service history',
    'HA entity linking',
    'Condition assessments',
    'Photo documentation',
  ],

  routes: [
    { path: '/inventory',              element: <InventoryScreen />        },
    { path: '/equipment/:id',          element: <EquipmentDetailScreen />  },
    { path: '/capture/:id',            element: <EquipmentFormScreen />    },
    { path: '/equipment/:id/inspect',  element: <InspectionScreen />       },
  ],

  navItems: [
    { label: 'Inventory', path: '/inventory', icon: ClipboardList, group: 'property' },
  ],

  recordTypes: [
    { typeName: 'equipment', schema: EquipmentZ, syncable: true },
  ],
}

export default InventoryModule
