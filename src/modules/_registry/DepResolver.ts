/**
 * Dependency-graph helpers for the module registry.
 *
 * Three pure functions:
 *   - `expandWithDeps(enabled)` — closes over `requires` so the active set
 *     reflects everything the user's enabled modules transitively need;
 *     `'core'` is always included.
 *   - `getActivationOrder(activeIds)` — topological sort: deps before
 *     dependents. Used by the boot sequence to call `onActivate` in the
 *     right order.
 *   - `assertNoCycles()` — DFS gray/black colouring over the registered
 *     modules; throws with the cycle path so a misconfigured `requires`
 *     declaration fails loudly at boot rather than producing a silent
 *     deadlock.
 *
 * The functions take the registry as input so tests can supply a
 * synthetic in-memory registry without touching the real singleton.
 */

import { moduleRegistry } from './ModuleRegistry'
import type { ModuleDefinition } from './ModuleDefinition'
import type { ModuleId } from './types'

/** Hard-coded baseline. `core` is always part of the active set even when
 *  the user has disabled everything else. Built-in modules (e.g. `core`)
 *  also carry `required: true`, but listing the id here means the resolver
 *  doesn't need to load `ModuleDefinition` to figure out the floor. */
const ALWAYS_ACTIVE: ReadonlyArray<ModuleId> = ['core']

/**
 * Expand the user's `enabled` flags into the FULL set of active module
 * ids by walking `requires` transitively. Modules in `ALWAYS_ACTIVE` are
 * always included.
 *
 * Idempotent and pure — call as often as you like.
 */
export function expandWithDeps(enabled: Record<string, boolean>): Set<ModuleId> {
  const active = new Set<ModuleId>(ALWAYS_ACTIVE)

  // Seed with explicit user-enabled ids. Unknown ids are kept (we still
  // surface them as active so a later module-load resolves them).
  for (const [id, on] of Object.entries(enabled)) {
    if (on) active.add(id)
  }

  // BFS over `requires`. Cap iterations so a malformed graph can't
  // infinite-loop (assertNoCycles is the canonical guard, but defence in
  // depth here is cheap).
  const queue: ModuleId[] = [...active]
  let safety = 1000
  while (queue.length > 0 && safety-- > 0) {
    const id = queue.shift()!
    const def = moduleRegistry.get(id)
    if (!def?.requires) continue
    for (const req of def.requires) {
      if (!active.has(req)) {
        active.add(req)
        queue.push(req)
      }
    }
  }
  return active
}

/**
 * Topological sort of the active set: deps before dependents.
 *
 * Returns the matching `ModuleDefinition[]` (modules unknown to the
 * registry are silently skipped — the resolver doesn't fail because the
 * activation phase doesn't have anything to do with them anyway).
 *
 * The traversal is depth-first: we recurse into a module's `requires`
 * before pushing the module itself, producing post-order which is the
 * activation order. Cycles are caught by `assertNoCycles` (call that
 * before trusting this function in a fresh dep graph).
 */
export function getActivationOrder(activeIds: Set<ModuleId>): ModuleDefinition[] {
  const ordered: ModuleDefinition[] = []
  const placed = new Set<ModuleId>()

  function visit(id: ModuleId): void {
    if (placed.has(id)) return
    if (!activeIds.has(id)) return  // not part of the active subgraph
    const def = moduleRegistry.get(id)
    if (!def) {
      // Unknown id — skip but mark placed so we don't loop on it via a
      // dependent's `requires` list.
      placed.add(id)
      return
    }
    for (const req of def.requires ?? []) visit(req)
    placed.add(id)
    ordered.push(def)
  }

  for (const id of activeIds) visit(id)
  return ordered
}

/**
 * DFS-with-colours cycle detection over the FULL registry (not just the
 * active set — a cycle in any registered module is a bug).
 *
 *   white = not visited
 *   gray  = currently on the recursion stack
 *   black = fully visited
 *
 * Hitting a gray node mid-DFS proves a back-edge → cycle. Throws an Error
 * whose message names every module on the cycle so the developer knows
 * exactly which `requires` chain to break.
 */
export function assertNoCycles(): void {
  type Colour = 'gray' | 'black'
  const colour = new Map<ModuleId, Colour>()

  function visit(id: ModuleId, stack: ModuleId[]): void {
    const c = colour.get(id)
    if (c === 'black') return
    if (c === 'gray') {
      const cycleStart = stack.indexOf(id)
      const cycle = [...stack.slice(cycleStart), id].join(' → ')
      throw new Error(`Module dependency cycle detected: ${cycle}`)
    }
    colour.set(id, 'gray')
    const def = moduleRegistry.get(id)
    for (const req of def?.requires ?? []) {
      visit(req, [...stack, id])
    }
    colour.set(id, 'black')
  }

  for (const def of moduleRegistry.getAll()) {
    visit(def.id, [])
  }
}
