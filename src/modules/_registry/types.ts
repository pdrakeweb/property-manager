/**
 * Shared primitive types for the module registry.
 *
 * Kept in a tiny module of its own so the framework files (registry,
 * dep-resolver, context) don't pull in React or Zod just to reference
 * a string union — this matters once modules can be discovered at module
 * load and we want the dependency graph itself to be cycle-free between
 * the registry framework files.
 */

export type ModuleId = string

/**
 * Side-bar grouping that nav items declare. Keep this list in sync with
 * the AppShell's section labels — see `src/components/layout/AppShell.tsx`.
 *
 * - `property` — top-level navs above the section dropdowns (Dashboard,
 *   Capture, Maintenance, Calendar, Checklists, Ask AI, Search, Import)
 * - `systems`  — house systems (HVAC, plumbing, generator, …) that map to
 *   the existing "PROPERTY" section
 * - `finance`  — Budget, Tax, Mortgage, Utilities, Insurance
 * - `tools`    — admin / cross-cutting (Profile, Inventory, Vendors, …)
 * - `admin`    — settings and meta (Settings, Activity, Sync). May render
 *   in the bottom rail rather than the main nav.
 */
export type NavGroup = 'property' | 'systems' | 'finance' | 'tools' | 'admin'
