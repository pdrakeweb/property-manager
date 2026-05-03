/**
 * `core` module — the always-on baseline that every property runs.
 *
 * Phase 1 contract: this declaration is REGISTERED but not yet rendered.
 * The existing static routes in `App.tsx` and the static nav in
 * `AppShell.tsx` continue to drive the UI. Future phases will replace
 * those static blocks with `useActiveModuleIds()`-driven equivalents,
 * at which point the routes/navItems below become live.
 *
 * Mirrors the routes/nav already wired in `App.tsx` for the screens
 * everyone needs regardless of which optional modules they enable.
 */

import { lazy } from 'react'
import { z } from 'zod'
import { LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { PropertyZ } from '@/records/property'
import { DashboardScreen } from '@/screens/DashboardScreen'

// Lazy-loaded screens (split into per-route chunks). Mirrors the lazy
// imports already in `App.tsx` so we share the same chunk boundaries
// once these routes go live.
const SettingsScreen = lazy(() =>
  import('@/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })),
)
const SyncScreen = lazy(() =>
  import('@/screens/SyncScreen').then(m => ({ default: m.SyncScreen })),
)
const SearchScreen = lazy(() =>
  import('@/screens/SearchScreen').then(m => ({ default: m.SearchScreen })),
)

// `property_modules` schema — the persistence shape declared by
// `ActiveModuleContext`. Phase 0 stores instances in localStorage; a
// later phase moves them into the vault under this typeName so module
// choices ride the same Drive sync as everything else.
const PropertyModulesZ = z.object({
  _type:      z.literal('property_modules'),
  _id:        z.string(),
  propertyId: z.string(),
  enabled:    z.record(z.string(), z.boolean()),
  config:     z.record(z.string(), z.unknown()),
  updatedAt:  z.string(),
})

export const CoreModule: ModuleDefinition = {
  id:          'core',
  name:        'Core',
  description:
    'Always-on baseline: dashboard, settings, sync, search, and the property + module bookkeeping that every other module depends on.',
  version:     '1.0.0',
  required:    true,
  category:    'core',
  icon:        '🏠',
  capabilities: [
    'Property management',
    'Drive sync',
    'CRDT offline-first',
    'Settings',
  ],

  // Routes mirror the existing entries in `App.tsx`. Future phases will
  // assemble React-Router routes from `getActivationOrder(activeIds)
  // .flatMap(m => m.routes ?? [])` — at that point this list becomes
  // the source of truth and the static block in App.tsx goes away.
  routes: [
    { path: '/',         element: <DashboardScreen /> },
    { path: '/settings', element: <SettingsScreen /> },
    { path: '/sync',     element: <SyncScreen /> },
    { path: '/search',   element: <SearchScreen /> },
  ],

  // Sidebar entries. AppShell already renders Dashboard + Settings out
  // of its hardcoded `TOP_NAV`; declaring them here is the seed for the
  // future activeIds-driven nav.
  navItems: [
    { label: 'Dashboard', path: '/',         icon: LayoutDashboard, group: 'property' },
    { label: 'Settings',  path: '/settings', icon: SettingsIcon,    group: 'admin'    },
  ],

  // Domain types this module owns. The vault's existing
  // `records/registry.ts` already registers `property` via the DSL — we
  // re-declare it here so the module-driven activation pipeline knows
  // who "owns" it. `property_modules` is a new type introduced by the
  // module system itself.
  recordTypes: [
    { typeName: 'property',         schema: PropertyZ,         syncable: true },
    { typeName: 'property_modules', schema: PropertyModulesZ,  syncable: true },
  ],
}

export default CoreModule
