/**
 * Module marketplace — per-property enable/disable for every registered
 * `ModuleDefinition`. Lives at `/settings/modules`.
 *
 * The screen is "live" — every toggle persists immediately to localStorage
 * via `useToggleModule` / `setEnabled`. Disabling a required module is
 * blocked at the toggle layer (the resolver short-circuits) and the UI
 * mirrors that with a locked toggle. Disabling a module that other
 * enabled modules depend on cascades through `computeToggle` so the user
 * can't strand a dependent in an active state when its dependency is gone.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Boxes, Calendar, Camera,
  CheckCircle2, ChevronLeft, ClipboardList, DollarSign, Droplets,
  FileCheck, FileClock, FileText, Folder, Home, Library, Lock, Map, MapPin,
  MessageSquare, Package, Receipt, RefreshCw, Search, Settings as SettingsIcon,
  Shield, ShieldAlert, Sparkles, ToggleLeft, ToggleRight, Users, Wrench, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../utils/cn'
import { moduleRegistry } from '../modules/_registry'
import {
  defaultPropertyModules,
  useActiveModuleIds,
  usePropertyModules,
} from '../modules/_registry'
import type {
  ModuleCategory,
  ModuleDefinition,
  ModuleId,
} from '../modules/_registry'
import { useAppStore } from '../store/AppStoreContext'

// ── Icon mapping ────────────────────────────────────────────────────────────
//
// Module definitions store their icon as a string (Lucide identifier or
// emoji). We translate to a real component here so each module file can
// stay free of a heavy lucide-react import surface and so the marketplace
// is the single source of truth for icon styling.

const ICON_MAP: Record<string, LucideIcon> = {
  Activity, BarChart3, BookOpen, Boxes, Calendar, Camera, CheckCircle2,
  ClipboardList, DollarSign, Droplets, FileCheck, FileClock, FileText, Folder,
  Home, Library, Map, MapPin, MessageSquare, Package, Receipt, RefreshCw,
  Search, Settings: SettingsIcon, Shield, ShieldAlert, Sparkles, Users, Wrench, Zap,
}

function ModuleIcon({ icon, className }: { icon: string; className?: string }) {
  const Component = ICON_MAP[icon]
  if (Component) return <Component className={className} />
  // Fallback: emoji or unrecognised string — render as text so the card
  // still has a visual marker. Sized to match the lucide icons (16-20px).
  return <span className={cn('inline-block text-xl leading-none', className)}>{icon}</span>
}

// ── Categories ──────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | ModuleCategory

const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'core',     label: 'Core'     },
  { id: 'property', label: 'Property' },
  { id: 'systems',  label: 'Systems'  },
  { id: 'finance',  label: 'Finance'  },
  { id: 'ai',       label: 'AI'       },
  { id: 'tools',    label: 'Tools'    },
]

// ── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  mod:        ModuleDefinition
  enabled:    boolean
  active:     boolean
  unmetReqs:  ModuleId[]
  dependents: ModuleId[]
  onToggle:   () => void
  onEnableWithDeps: () => void
}

function ModuleCard({
  mod, enabled, active, unmetReqs, dependents, onToggle, onEnableWithDeps,
}: CardProps) {
  const required = mod.required === true
  const showDepWarning = !enabled && unmetReqs.length > 0
  const showDependentsWarning = enabled && dependents.length > 0

  return (
    <div className={cn(
      'flex flex-col gap-3 rounded-2xl border shadow-sm p-4 transition-colors',
      active
        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60',
    )}>
      {/* Header — icon + name + version + toggle */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200">
          <ModuleIcon icon={mod.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mod.name}</h3>
            <span className="text-[10px] font-mono uppercase tracking-wide bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded px-1.5 py-0.5">
              v{mod.version}
            </span>
            {required && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5">
                <Lock className="w-2.5 h-2.5" />
                Required
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{mod.description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={required}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${mod.name}`}
          aria-pressed={enabled}
          className={cn(
            'shrink-0 flex items-center justify-center transition-colors rounded-lg p-1',
            required
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : enabled
                ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400',
          )}
        >
          {enabled
            ? <ToggleRight className="w-9 h-9" />
            : <ToggleLeft  className="w-9 h-9" />
          }
        </button>
      </div>

      {/* Capabilities */}
      {mod.capabilities.length > 0 && (
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-1">
          {mod.capabilities.map(cap => (
            <li key={cap} className="flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 shrink-0" />
              <span>{cap}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Unmet-deps warning + Enable with deps action */}
      {showDepWarning && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
              Requires: {unmetReqs.map(id => moduleNameFor(id)).join(', ')}
            </p>
            <button
              type="button"
              onClick={onEnableWithDeps}
              className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
            >
              Enable with dependencies
            </button>
          </div>
        </div>
      )}

      {/* Disabling-cascade warning */}
      {showDependentsWarning && (
        <div className="flex items-start gap-2 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            Disabling will also disable: {dependents.map(id => moduleNameFor(id)).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

function moduleNameFor(id: ModuleId): string {
  return moduleRegistry.get(id)?.name ?? id
}

// ── Screen ──────────────────────────────────────────────────────────────────

export function ModuleSettingsScreen() {
  const navigate = useNavigate()
  const { activePropertyId } = useAppStore()
  const { record, setEnabled } = usePropertyModules(activePropertyId)
  const activeIds = useActiveModuleIds()
  const [filter, setFilter] = useState<CategoryFilter>('all')

  // All registered modules. Stable insertion order; module-browser sorting
  // lives here, not in the registry.
  const allModules = useMemo(() => {
    return [...moduleRegistry.getAll()].sort((a, b) => {
      // Required modules first, then alphabetical by name within each
      // category for predictable scanning.
      if (!!a.required !== !!b.required) return a.required ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [])

  const visibleModules = useMemo(() => {
    if (filter === 'all') return allModules
    return allModules.filter(m => m.category === filter)
  }, [allModules, filter])

  // Per-card derived data: unmet `requires` (when disabled) and dependents
  // that are currently enabled (when enabled). Cheap to compute on every
  // render — the dep graph rarely exceeds a few dozen edges.
  const enabledMap = record.enabled

  function unmetReqsFor(mod: ModuleDefinition): ModuleId[] {
    if (enabledMap[mod.id]) return []
    return (mod.requires ?? []).filter(req => !enabledMap[req])
  }

  function dependentsFor(mod: ModuleDefinition): ModuleId[] {
    // Modules that have `mod.id` in their `requires` AND are currently on.
    return allModules
      .filter(other => (other.requires ?? []).includes(mod.id))
      .filter(other => enabledMap[other.id])
      .map(other => other.id)
  }

  function toggle(id: ModuleId) {
    const next = computeToggle(enabledMap, id)
    setEnabled(next)
  }

  function enableWithDeps(id: ModuleId) {
    // Identical to the ON branch of computeToggle but called explicitly
    // from the dep-warning button so the user-visible action is clearer.
    const next: Record<string, boolean> = { ...enabledMap, [id]: true }
    const queue: ModuleId[] = [id]
    let safety = 1000
    while (queue.length > 0 && safety-- > 0) {
      const cur = queue.shift()!
      const def = moduleRegistry.get(cur)
      for (const req of def?.requires ?? []) {
        if (!next[req]) {
          next[req] = true
          queue.push(req)
        }
      }
    }
    setEnabled(next)
  }

  function enableAll() {
    const next: Record<string, boolean> = { ...enabledMap }
    for (const m of allModules) next[m.id] = true
    setEnabled(next)
  }

  function resetDefaults() {
    // Default policy = every module enabled (see defaultPropertyModules).
    setEnabled(defaultPropertyModules())
  }

  const stats = {
    total:   allModules.length,
    enabled: allModules.filter(m => enabledMap[m.id]).length,
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back to Settings */}
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300"
      >
        <ChevronLeft className="w-4 h-4" />
        Settings
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Modules</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Customize your property manager — enable only what you need.
            <span className="text-slate-400 dark:text-slate-500"> {stats.enabled} of {stats.total} enabled.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={enableAll}
            className="btn btn-secondary btn-sm"
          >
            Enable all
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="btn btn-ghost btn-sm"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Category sidebar */}
        <nav className="lg:w-44 shrink-0" aria-label="Module categories">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {CATEGORIES.map(cat => {
              const count = cat.id === 'all'
                ? allModules.length
                : allModules.filter(m => m.category === cat.id).length
              const isActive = filter === cat.id
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setFilter(cat.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors text-left whitespace-nowrap',
                      isActive
                        ? 'bg-green-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60',
                    )}
                  >
                    <span>{cat.label}</span>
                    <span className={cn(
                      'text-[11px] font-semibold rounded-full px-1.5 py-0.5',
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                    )}>
                      {count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Card grid */}
        <div className="flex-1 min-w-0">
          {visibleModules.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <p className="text-sm font-medium">No modules in this category yet.</p>
              <p className="text-xs mt-1">Phase 2 will add more modules over time.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleModules.map(mod => (
                <ModuleCard
                  key={mod.id}
                  mod={mod}
                  enabled={!!enabledMap[mod.id]}
                  active={activeIds.has(mod.id)}
                  unmetReqs={unmetReqsFor(mod)}
                  dependents={dependentsFor(mod)}
                  onToggle={() => toggle(mod.id)}
                  onEnableWithDeps={() => enableWithDeps(mod.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Toggle math ─────────────────────────────────────────────────────────────
//
// Mirrors the behaviour of `computeToggle` inside ActiveModuleContext but
// operates on a passed-in enabled map so we can call it from this screen
// with the same cascading-disable semantics. Kept inline rather than
// re-exported from the registry because the registry's version is bound
// to the React state setter and we want the pure-data version here.

function computeToggle(prev: Record<string, boolean>, id: ModuleId): Record<string, boolean> {
  const def = moduleRegistry.get(id)
  if (def?.required) return prev

  const goingOn = !prev[id]
  if (goingOn) {
    const next: Record<string, boolean> = { ...prev, [id]: true }
    const queue: ModuleId[] = [id]
    let safety = 1000
    while (queue.length > 0 && safety-- > 0) {
      const cur = queue.shift()!
      const d = moduleRegistry.get(cur)
      for (const req of d?.requires ?? []) {
        if (!next[req]) {
          next[req] = true
          queue.push(req)
        }
      }
    }
    return next
  }

  // OFF: cascade-disable transitive dependents.
  const next: Record<string, boolean> = { ...prev, [id]: false }
  const dependents = collectDependents(id)
  for (const dep of dependents) {
    const d = moduleRegistry.get(dep)
    if (d?.required) continue
    next[dep] = false
  }
  return next
}

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
