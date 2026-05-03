/**
 * `ActiveModuleProvider` — owns the per-property module-enable flags and
 * the derived "active id" closure (post-dependency-expansion).
 *
 * Storage shape (Phase 0): one localStorage entry per property keyed
 * `pm_property_modules_<propertyId>` holding a `PropertyModulesRecord`
 * (declared below). This deliberately bypasses the vault's localIndex —
 * Phase 0 keeps the dependency surface small. A later phase will migrate
 * the record into the vault as a synced `'property_modules'` IndexRecord
 * so module choices ride the same Drive sync as everything else.
 *
 * The provider mounts at the *top* of the React tree (above the auth
 * gate, in `main.tsx`) so context is available to anything that runs.
 * Because that's above `AppStoreProvider`, this file does NOT consume
 * `useAppStore`; it reads `active_property_id` from localStorage and
 * subscribes to a custom `pm-active-property-changed` window event so
 * same-tab switches are visible without prop-drilling. Cross-tab swaps
 * surface via the standard `'storage'` event.
 *
 * Phase 0/1 deliberate scope:
 *  - Hooks exist (`usePropertyModules`, `useActiveModuleIds`,
 *    `useModuleEnabled`, `useToggleModule`).
 *  - The existing `App.tsx` / `AppShell.tsx` do NOT yet read from this
 *    context. The provider is a no-op observer; nothing breaks if it
 *    misbehaves. Future phases will replace static routes/nav with
 *    activeIds-driven equivalents.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { moduleRegistry } from './ModuleRegistry'
import { expandWithDeps } from './DepResolver'
import type { ModuleId } from './types'

/**
 * Default `enabled` map for a brand-new property: every module the
 * registry currently knows about is turned ON. The product policy is
 * "modules are enabled by default; the only way one becomes disabled is
 * explicit user action in Settings."
 *
 * Reads the registry at call time so adding a module post-boot still
 * picks it up (e.g. tests that register synthetic modules).
 */
export function defaultPropertyModules(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const def of moduleRegistry.getAll()) {
    out[def.id] = true
  }
  return out
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Per-property module configuration. Persisted as JSON under
 * `pm_property_modules_<propertyId>`. Future phases will move this into
 * the vault under the `property_modules` IndexRecord type — at which
 * point the `_type` and `_id` discriminators line up with the rest of
 * the index.
 */
export interface PropertyModulesRecord {
  _type:      'property_modules'
  _id:        string                       // == propertyId
  propertyId: string
  enabled:    Record<string, boolean>      // user-explicit on/off; deps applied at read time
  config:     Record<string, unknown>      // per-module free-form settings (Phase 2+)
  updatedAt:  string                       // ISO
}

const STORAGE_PREFIX = 'pm_property_modules_'

/** Same-tab "active property changed" channel. AppStoreContext fires this
 *  whenever it writes `active_property_id`; we listen for it to refresh
 *  the provider without a prop-drill (the provider sits above
 *  AppStoreProvider in the React tree). */
export const ACTIVE_PROPERTY_CHANGED_EVENT = 'pm-active-property-changed'

function emptyRecord(propertyId: string): PropertyModulesRecord {
  // New properties get every registered module turned on. See
  // `defaultPropertyModules()` for the policy rationale.
  return {
    _type:      'property_modules',
    _id:        propertyId,
    propertyId,
    enabled:    defaultPropertyModules(),
    config:     {},
    updatedAt:  new Date().toISOString(),
  }
}

/**
 * Read a property's module record from localStorage, applying the
 * "module unset → enabled" migration on the way out.
 *
 * Migration rules:
 *  - module id present in registry, missing from stored `enabled`     → enable (true)
 *  - module id present in registry, stored as `true` or `false`       → keep stored value
 *  - module id present in stored `enabled` but unknown to the registry → keep stored value
 *    (don't drop it — the module file may not have loaded yet, e.g.
 *     during test boot, and we don't want to lose the user's choice)
 *
 * Returns the migrated record. If migration changed anything, the caller
 * should persist back; `readPropertyModulesAndMigrate` does that for you
 * and is the function you almost always want.
 */
function migrateEnabled(stored: Record<string, boolean>): { enabled: Record<string, boolean>; changed: boolean } {
  const next: Record<string, boolean> = { ...stored }
  let changed = false
  for (const def of moduleRegistry.getAll()) {
    if (!(def.id in next)) {
      next[def.id] = true
      changed = true
    }
  }
  return { enabled: next, changed }
}

function readPropertyModules(propertyId: string): PropertyModulesRecord {
  if (!propertyId || typeof localStorage === 'undefined') return emptyRecord(propertyId)
  const raw = localStorage.getItem(STORAGE_PREFIX + propertyId)
  if (!raw) return emptyRecord(propertyId)
  try {
    const parsed = JSON.parse(raw) as PropertyModulesRecord
    // Defensive shape patch — make sure required fields exist even if the
    // stored record predates a schema bump.
    const storedEnabled = parsed.enabled ?? {}
    const { enabled }   = migrateEnabled(storedEnabled)
    return {
      _type:      'property_modules',
      _id:        propertyId,
      propertyId,
      enabled,
      config:     parsed.config  ?? {},
      updatedAt:  parsed.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    return emptyRecord(propertyId)
  }
}

/** Read + persist any migration as a single side-effecting call. Used by
 *  the provider on first load and on property switch so the persisted
 *  state matches the in-memory state. */
function readAndMigratePropertyModules(propertyId: string): PropertyModulesRecord {
  if (!propertyId || typeof localStorage === 'undefined') return emptyRecord(propertyId)
  const raw = localStorage.getItem(STORAGE_PREFIX + propertyId)
  if (!raw) {
    // No record at all — write the default (everything enabled) so the
    // migration is a one-time event rather than a per-read recomputation.
    const fresh = emptyRecord(propertyId)
    writePropertyModules(fresh)
    return fresh
  }
  try {
    const parsed = JSON.parse(raw) as PropertyModulesRecord
    const storedEnabled = parsed.enabled ?? {}
    const { enabled, changed } = migrateEnabled(storedEnabled)
    const next: PropertyModulesRecord = {
      _type:      'property_modules',
      _id:        propertyId,
      propertyId,
      enabled,
      config:     parsed.config  ?? {},
      updatedAt:  changed ? new Date().toISOString() : (parsed.updatedAt ?? new Date().toISOString()),
    }
    if (changed) writePropertyModules(next)
    return next
  } catch {
    const fresh = emptyRecord(propertyId)
    writePropertyModules(fresh)
    return fresh
  }
}

function writePropertyModules(record: PropertyModulesRecord): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_PREFIX + record.propertyId, JSON.stringify(record))
}

// ─── Toggle math ────────────────────────────────────────────────────────────

/**
 * Compute the new `enabled` map after a user toggle. Honors the
 * dependency graph:
 *
 *   - turning a module ON also turns its `requires` chain ON;
 *   - turning a module OFF also turns OFF every module that transitively
 *     `requires` it (so the user can't strand a dependent in an active
 *     state when its dependency is gone);
 *   - `required: true` modules cannot be turned off — toggle becomes a
 *     no-op rather than throwing, so a misclick on the module browser
 *     doesn't hard-error.
 */
function computeToggle(
  prev:     Record<string, boolean>,
  moduleId: ModuleId,
): Record<string, boolean> {
  const def = moduleRegistry.get(moduleId)
  if (def?.required) return prev  // can't disable required modules

  // Decide direction: the user's intent is to flip the explicit flag.
  const current = !!prev[moduleId]
  const goingOn = !current

  if (goingOn) {
    // ON: also enable transitive `requires`.
    const next = { ...prev, [moduleId]: true }
    const queue: ModuleId[] = [moduleId]
    let safety = 1000
    while (queue.length > 0 && safety-- > 0) {
      const id = queue.shift()!
      const d = moduleRegistry.get(id)
      for (const req of d?.requires ?? []) {
        if (!next[req]) {
          next[req] = true
          queue.push(req)
        }
      }
    }
    return next
  }

  // OFF: also disable everything that requires this module (transitively).
  const next = { ...prev, [moduleId]: false }
  const dependents = collectDependents(moduleId)
  for (const dep of dependents) {
    const d = moduleRegistry.get(dep)
    if (d?.required) continue  // never auto-disable a required dependent
    next[dep] = false
  }
  return next
}

/** All modules that transitively `require` `target`. */
function collectDependents(target: ModuleId): Set<ModuleId> {
  const result = new Set<ModuleId>()
  const all = moduleRegistry.getAll()
  let changed = true
  while (changed) {
    changed = false
    for (const def of all) {
      if (result.has(def.id)) continue
      const reqs = def.requires ?? []
      if (reqs.includes(target) || reqs.some(r => result.has(r))) {
        result.add(def.id)
        changed = true
      }
    }
  }
  return result
}

// ─── Context ───────────────────────────────────────────────────────────────

interface ActiveModuleContextValue {
  /** Currently-active property id (mirror of `active_property_id`). */
  activePropertyId: string | null
  /** Closure over the user's enabled flags + transitive `requires`. Always
   *  includes `'core'`. */
  activeIds: Set<ModuleId>
  /** Raw enabled flags for the current property. */
  enabled: Record<string, boolean>
  /** Apply a toggle. Honors deps both ways (see `computeToggle`). */
  toggleModule: (id: ModuleId) => void
  /** Read the per-property module record (returns an empty record when
   *  no property is active or the record doesn't exist yet). */
  readForProperty: (propertyId: string) => PropertyModulesRecord
  /** Replace the entire enabled map for the active property — used by
   *  the module-browser "Reset to defaults" button (Phase 2+). */
  setEnabled: (next: Record<string, boolean>) => void
}

const ActiveModuleContext = createContext<ActiveModuleContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────

export function ActiveModuleProvider({ children }: { children: ReactNode }) {
  const [activePropertyId, setActivePropertyId] = useState<string | null>(() => {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem('active_property_id')
  })

  // Track the active property across same-tab and cross-tab changes.
  // Same-tab: AppStoreContext fires `pm-active-property-changed` on every
  //           setActivePropertyId. Cross-tab: storage event fires whenever
  //           localStorage is mutated by another tab.
  useEffect(() => {
    function refresh() {
      const next = typeof localStorage !== 'undefined'
        ? localStorage.getItem('active_property_id')
        : null
      setActivePropertyId(next)
    }
    window.addEventListener(ACTIVE_PROPERTY_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(ACTIVE_PROPERTY_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  // Per-property enabled map. Re-loaded whenever the active property
  // changes. Use the migrating reader so any module ids missing from the
  // stored record are filled in as `true` (one-time per-property
  // migration — see `readAndMigratePropertyModules`).
  const [enabled, setEnabledState] = useState<Record<string, boolean>>(() => {
    return activePropertyId
      ? readAndMigratePropertyModules(activePropertyId).enabled
      : defaultPropertyModules()
  })
  useEffect(() => {
    setEnabledState(
      activePropertyId
        ? readAndMigratePropertyModules(activePropertyId).enabled
        : defaultPropertyModules(),
    )
  }, [activePropertyId])

  // Active id closure. `core` is always included even when no property
  // is set (see DepResolver.ALWAYS_ACTIVE) so consumers always get a
  // sensible non-empty set.
  const activeIds = useMemo(() => expandWithDeps(enabled), [enabled])

  const persist = useCallback((nextEnabled: Record<string, boolean>) => {
    if (!activePropertyId) return
    const prior = readPropertyModules(activePropertyId)
    writePropertyModules({
      ...prior,
      enabled:   nextEnabled,
      updatedAt: new Date().toISOString(),
    })
  }, [activePropertyId])

  const toggleModule = useCallback((id: ModuleId) => {
    setEnabledState(prev => {
      const next = computeToggle(prev, id)
      persist(next)
      return next
    })
  }, [persist])

  const setEnabled = useCallback((next: Record<string, boolean>) => {
    setEnabledState(next)
    persist(next)
  }, [persist])

  const readForProperty = useCallback(
    (propertyId: string) => readPropertyModules(propertyId),
    [],
  )

  const value = useMemo<ActiveModuleContextValue>(() => ({
    activePropertyId,
    activeIds,
    enabled,
    toggleModule,
    readForProperty,
    setEnabled,
  }), [activePropertyId, activeIds, enabled, toggleModule, readForProperty, setEnabled])

  return (
    <ActiveModuleContext.Provider value={value}>
      {children}
    </ActiveModuleContext.Provider>
  )
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

function useActiveModuleContext(): ActiveModuleContextValue {
  const ctx = useContext(ActiveModuleContext)
  if (!ctx) {
    throw new Error(
      '[modules] hook called outside <ActiveModuleProvider>. ' +
      'Wrap your tree in <ActiveModuleProvider> in main.tsx.',
    )
  }
  return ctx
}

/** Set of module ids active for the current property (post-dep-expansion). */
export function useActiveModuleIds(): Set<ModuleId> {
  return useActiveModuleContext().activeIds
}

/** Is this specific module active right now? */
export function useModuleEnabled(moduleId: ModuleId): boolean {
  const { activeIds } = useActiveModuleContext()
  return activeIds.has(moduleId)
}

/** Stable toggle callback bound to a specific module. Component re-renders
 *  when the active set changes. */
export function useToggleModule(moduleId: ModuleId): () => void {
  const { toggleModule } = useActiveModuleContext()
  return useCallback(() => toggleModule(moduleId), [toggleModule, moduleId])
}

/**
 * Read/write a property's module record directly. Used by the module
 * browser screen and by tests. Pass `null` when no property is selected
 * (returns an empty record so callers can render a placeholder).
 */
export function usePropertyModules(propertyId: string | null): {
  record: PropertyModulesRecord
  setEnabled: (next: Record<string, boolean>) => void
  setConfig: (next: Record<string, unknown>) => void
} {
  const ctx = useActiveModuleContext()
  const isActive = !!propertyId && propertyId === ctx.activePropertyId

  // Reactive mirror of the record. For the active property we hand back
  // the live context state; for any other property we read from storage
  // on demand.
  const record: PropertyModulesRecord = useMemo(() => {
    if (!propertyId) return emptyRecord('')
    if (isActive) {
      return {
        _type:     'property_modules',
        _id:       propertyId,
        propertyId,
        enabled:   ctx.enabled,
        config:    readPropertyModules(propertyId).config,
        updatedAt: new Date().toISOString(),
      }
    }
    return readPropertyModules(propertyId)
  }, [propertyId, isActive, ctx.enabled])

  const setEnabled = useCallback((next: Record<string, boolean>) => {
    if (!propertyId) return
    if (isActive) {
      ctx.setEnabled(next)
      return
    }
    const prior = readPropertyModules(propertyId)
    writePropertyModules({ ...prior, enabled: next, updatedAt: new Date().toISOString() })
  }, [propertyId, isActive, ctx])

  const setConfig = useCallback((nextConfig: Record<string, unknown>) => {
    if (!propertyId) return
    const prior = readPropertyModules(propertyId)
    writePropertyModules({ ...prior, config: nextConfig, updatedAt: new Date().toISOString() })
  }, [propertyId])

  return { record, setEnabled, setConfig }
}
