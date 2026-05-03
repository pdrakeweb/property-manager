/**
 * Module registry — process-singleton holding every `ModuleDefinition`
 * loaded by the discovery barrel (`src/modules/index.ts`).
 *
 * Population: each module file imports the registry and calls
 * `moduleRegistry.register(def)` at module load time. Order doesn't matter —
 * dependency expansion happens later via `DepResolver`.
 *
 * Duplicate `register(...)` calls warn and are dropped (not thrown). HMR in
 * dev mode re-imports module files when they change; throwing would crash
 * the page. The first registration wins so the in-memory shape stays stable.
 */

import type { ModuleDefinition } from './ModuleDefinition'
import type { ModuleId } from './types'

class ModuleRegistry {
  private readonly modules = new Map<ModuleId, ModuleDefinition>()

  /** Register a module. No-op (with a console warning) if `def.id` is
   *  already registered — see file header. */
  register(def: ModuleDefinition): void {
    if (this.modules.has(def.id)) {
      // Dev-mode HMR will hit this path on every save of a module file. The
      // existing definition is kept (it's the one already wired into React
      // state); a code change requires a full reload to take effect.
      console.warn(`[modules] duplicate registration ignored: ${def.id}`)
      return
    }
    this.modules.set(def.id, def)
  }

  /** Lookup by id. Returns `null` for unknown ids. */
  get(id: ModuleId): ModuleDefinition | null {
    return this.modules.get(id) ?? null
  }

  /** All registered modules in insertion order (stable for deterministic
   *  rendering). The dep resolver re-orders for activation; UI surfaces
   *  like the module browser sort separately. */
  getAll(): ModuleDefinition[] {
    return [...this.modules.values()]
  }
}

/** Process-singleton. `import { moduleRegistry } from '@/modules/_registry'`
 *  always returns the same instance, since ES modules are evaluated once. */
export const moduleRegistry = new ModuleRegistry()
