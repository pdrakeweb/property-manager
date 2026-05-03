/**
 * RouterBuilder — assembles the live React-Router config from the
 * currently-active module set.
 *
 * Phase 3 contract: `App.tsx` calls `buildRoutes(activeIds)` once per
 * render via the `useActiveModuleIds()` Set, then feeds the result into
 * `useRoutes(...)`. Toggling a module on/off therefore shows/hides its
 * routes on the next render — no app-wide refresh needed.
 *
 * Disabled modules are simply skipped: their routes are NOT registered,
 * so navigating to a path owned by a disabled module falls through to
 * the static catch-all in `App.tsx`.
 */

import type { RouteObject } from 'react-router-dom'
import { moduleRegistry } from './ModuleRegistry'
import type { ModuleId } from './types'

export function buildRoutes(activeModuleIds: Iterable<ModuleId>): RouteObject[] {
  const activeSet = activeModuleIds instanceof Set
    ? activeModuleIds as Set<ModuleId>
    : new Set<ModuleId>(activeModuleIds)

  const routes: RouteObject[] = []
  for (const mod of moduleRegistry.getAll()) {
    if (!activeSet.has(mod.id)) continue
    if (mod.routes) routes.push(...mod.routes)
  }
  return routes
}
