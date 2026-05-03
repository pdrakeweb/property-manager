/**
 * `search` module — cross-record full-text search across the local index.
 *
 * Phase 2 contract: this declaration is REGISTERED but not yet rendered.
 * The existing static route in `App.tsx` and the static nav in
 * `AppShell.tsx` continue to drive the UI. Note that `core/index.tsx`
 * also declares `/search` for the Phase-1 baseline; the duplicate is
 * intentional during Phase 2 (declarations are not yet authoritative)
 * and will be resolved when the activeIds-driven shell removes the
 * route from CoreModule and lets SearchModule own it.
 *
 * No record types — search indexes existing records owned by other
 * modules and produces no persisted data of its own.
 */

import { lazy } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'

const SearchScreen = lazy(() =>
  import('@/screens/SearchScreen').then(m => ({ default: m.SearchScreen })),
)

export const SearchModule: ModuleDefinition = {
  id:           'search',
  name:         'Search',
  description:
    'Instant offline-first full-text search across every record in the local index. Results are grouped by record type so the user can scan equipment, tasks, vendors, and history in one pane.',
  version:      '1.0.0',
  category:     'tools',
  icon:         '🔍',
  capabilities: [
    'Full-text search across all records',
    'Instant offline results',
    'Grouped results by type',
  ],

  routes: [
    { path: '/search', element: <SearchScreen /> },
  ],

  navItems: [
    {
      label: 'Search',
      path:  '/search',
      icon:  SearchIcon,
      group: 'tools',
      // Search has no notion of "unread" or "pending" — surface no badge.
      // Declared explicitly so the AppShell badge pipeline can rely on
      // the hook always being callable for nav items that opt in.
      useBadge: () => undefined,
    },
  ],
}

export default SearchModule
