/**
 * `ModuleDefinition` — the unit of feature discovery.
 *
 * A module bundles routes, nav entries, record-type registrations, an
 * optional settings panel, and lifecycle hooks. The host app discovers
 * modules through `src/modules/index.ts` (the discovery barrel) and then
 * the registry composes them at boot.
 *
 * Phase 0 / Phase 1 contract:
 *  - Modules are *declared* but not yet rendered (the existing static
 *    routes / nav in `App.tsx` and `AppShell.tsx` are still authoritative).
 *  - Future phases will consume `routes` / `navItems` to drive the UI
 *    from the active set.
 *
 * Keep this file dependency-light: it imports React/Zod/router types only
 * (no runtime). That lets `types.ts`, `ModuleRegistry`, and `DepResolver`
 * stay browser-bundle-friendly even as the module surface grows.
 */

import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import type { ZodTypeAny } from 'zod'
import type { ModuleId, NavGroup } from './types'

// ─── Nav items ──────────────────────────────────────────────────────────────

export interface NavItem {
  /** Visible label (rendered in the sidebar / bottom-bar). */
  label: string
  /** Hash-router path the nav navigates to (e.g. `/budget`). */
  path: string
  /** Lucide icon (or any `ComponentType<{ className?: string }>`). */
  icon: ComponentType<{ className?: string }>
  /** Which sidebar section this lives in. */
  group: NavGroup
  /**
   * Optional badge counter for the nav row. The hook is called from
   * the AppShell while the module is active; return `undefined` to hide
   * the badge, or a number to display. Keep the implementation cheap —
   * it runs on every shell re-render.
   */
  useBadge?: () => number | undefined
}

// ─── Record type registration ───────────────────────────────────────────────

/**
 * One record-type contribution from a module. The registry forwards these
 * to the existing DSL `records/registry.ts` at activation time so the
 * vault validates and folder-routes them like any built-in type.
 */
export interface RecordTypeRegistration {
  /** Stable type key, e.g. `'permit'`, `'fuel_delivery'`. */
  typeName: string
  /** Zod schema validated against `IndexRecord.data`. */
  schema: ZodTypeAny
  /**
   * `true` (default) means the record participates in Drive sync via the
   * normal pull/push paths. `false` is for purely-local records (e.g.
   * cached HA state) that should not round-trip through Drive.
   */
  syncable?: boolean
  /**
   * Schema-version migration. Called by the vault on pull when a remote
   * record's stored shape pre-dates the current schema. Returns the
   * upgraded payload. Should be pure and idempotent.
   */
  migrate?: (oldRecord: Record<string, unknown>) => Record<string, unknown>
}

// ─── Settings section ───────────────────────────────────────────────────────

export interface SettingsSection {
  /** Renders inside the Settings screen's per-module list. */
  component: ComponentType
  /** Tab label / accordion header. */
  label: string
}

// ─── Module categories (used by the module browser UI) ─────────────────────

export type ModuleCategory =
  | 'core'
  | 'property'
  | 'systems'
  | 'finance'
  | 'ai'
  | 'tools'

// ─── ModuleDefinition ───────────────────────────────────────────────────────

export interface ModuleDefinition {
  /** Globally unique id. Convention: kebab-case (`'budget'`, `'home-book'`). */
  id: ModuleId
  /** Display name shown in the module browser. */
  name: string
  /** One-paragraph description for the module-browser card. */
  description: string
  /** SemVer string. Stamped onto records this module produces; future
   *  schema changes bump this and ship a `migrate` for the relevant
   *  recordTypes. */
  version: string

  // ── Dependency graph ───────────────────────────────────────────────────
  /** Modules whose features this one depends on. Activating this module
   *  transitively activates its requires. */
  requires?: ModuleId[]
  /** Modules this one *enhances* — it adds value when both are present
   *  but does NOT force the other on. Used by the browser UI to surface
   *  recommended pairings; not part of the activation closure. */
  enhances?: ModuleId[]

  // ── UI contributions (rendered when the module is active) ──────────────
  /** Routes added to the React-Router config. */
  routes?: RouteObject[]
  /** Nav rail entries. */
  navItems?: NavItem[]
  /** Optional settings panel for the Settings screen. */
  settingsSection?: SettingsSection

  // ── Domain contributions ──────────────────────────────────────────────
  /** Record types this module owns. Registered into the vault's DSL
   *  registry at module activation time. */
  recordTypes?: RecordTypeRegistration[]

  // ── Lifecycle hooks ───────────────────────────────────────────────────
  /** Called the first time the user enables the module on a property —
   *  use it to seed defaults, show a welcome screen, etc. */
  onActivate?: (propertyId: string) => Promise<void> | void
  /** Called when the user disables the module on a property. Tear-down
   *  here (close subscriptions, clear caches). Do NOT delete user data —
   *  re-enabling should restore it. */
  onDeactivate?: (propertyId: string) => Promise<void> | void

  // ── Module-browser metadata ────────────────────────────────────────────
  /** Bucketing for the module-browser tabs. */
  category: ModuleCategory
  /** Lucide icon name OR emoji rendered on the module-browser card. */
  icon: string
  /** When `true`, the module is part of the always-on baseline (e.g.
   *  `core`) and cannot be disabled by the user. The dep resolver short-
   *  circuits any toggle attempt for these. */
  required?: boolean
  /** Bullet list shown on the module-browser card — what the module does
   *  in plain language. */
  capabilities: string[]
}
