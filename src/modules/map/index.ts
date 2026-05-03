/**
 * `map` module — geographic + climate context for a property.
 *
 * Renders a map view derived from the property's lat/lng plus pulled-in
 * climate-zone, weather, and energy-rate data. No record types of its own
 * — everything it shows is derived from `property` (owned by core) and
 * external API responses cached on the screen.
 *
 * Phase 1/2 contract: registered but not rendered. Future phases consume
 * `routes` / `navItems` to drive the UI from the active module set.
 */

import { createElement, lazy } from 'react'
import { Map as MapIcon } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'

const MapScreen = lazy(() =>
  import('@/screens/MapScreen').then(m => ({ default: m.MapScreen })),
)

export const MapModule: ModuleDefinition = {
  id:          'map',
  name:        'Map',
  description:
    'Property map view with climate-zone overlays, weather forecast, and regional energy rate context. Reads its data from the property\'s configured latitude / longitude.',
  version:     '1.0.0',
  category:    'tools',
  icon:        '🗺️',
  capabilities: [
    'Property map view',
    'Climate zone data',
    'Weather integration',
    'Energy rates',
  ],

  routes: [
    { path: '/map', element: createElement(MapScreen) },
  ],

  navItems: [
    { label: 'Map', path: '/map', icon: MapIcon, group: 'tools' },
  ],

  // No record types — derived from property lat/lng + external APIs.
}

export default MapModule
