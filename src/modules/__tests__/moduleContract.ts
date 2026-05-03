/**
 * Shared assertions for the ModuleDefinition contract.
 *
 * Per-module test files call `assertModuleContract(mod)` to verify the
 * fields every module must declare, plus `assertRoutes` / `assertNavItems`
 * / `assertRecordTypes` / `assertLifecycle` à la carte for the optional
 * pieces. Each helper is a Vitest-aware function that runs `expect(...)`
 * assertions internally so callers stay terse.
 */

import { expect } from 'vitest'
import { z } from 'zod'
import type { ModuleDefinition, ModuleCategory } from '@/modules/_registry'

const VALID_CATEGORIES: ReadonlySet<ModuleCategory> = new Set([
  'core', 'property', 'systems', 'finance', 'ai', 'tools',
] as const)

const VALID_NAV_GROUPS = new Set([
  'property', 'tools', 'finance', 'systems', 'admin',
])

/**
 * Top-level invariants every module must satisfy. Catches typos in the
 * required fields (id, name, version, category, icon) and shape errors
 * in `capabilities` / `description`.
 */
export function assertModuleContract(mod: ModuleDefinition): void {
  expect(mod.id, 'module.id').toBeTypeOf('string')
  expect(mod.id.length, `module.id length: ${mod.id}`).toBeGreaterThan(0)
  expect(mod.id, `module.id kebab-case: ${mod.id}`).toMatch(/^[a-z][a-z0-9-]*$/)

  expect(mod.name, 'module.name').toBeTypeOf('string')
  expect(mod.name.length).toBeGreaterThan(0)

  expect(mod.description, 'module.description').toBeTypeOf('string')
  expect(mod.description.length).toBeGreaterThan(20)

  expect(mod.version, 'module.version').toMatch(/^\d+\.\d+\.\d+/)

  expect(mod.category, `module.category: ${mod.category}`).toBeTypeOf('string')
  expect(VALID_CATEGORIES.has(mod.category), `module.category in valid set`).toBe(true)

  expect(mod.icon, 'module.icon').toBeTypeOf('string')
  expect(mod.icon.length).toBeGreaterThan(0)

  expect(Array.isArray(mod.capabilities), 'module.capabilities is array').toBe(true)
  expect(mod.capabilities.length, 'module.capabilities non-empty').toBeGreaterThan(0)
  for (const cap of mod.capabilities) expect(cap).toBeTypeOf('string')

  if (mod.required !== undefined) expect(mod.required).toBeTypeOf('boolean')
}

/**
 * `requires` references only valid module-id-shaped strings. We can't
 * assert against a closed enum (ModuleId is a `string` alias, not a
 * union) but we CAN check that nothing here is empty / non-kebab-case.
 */
export function assertRequiresShape(mod: ModuleDefinition): void {
  if (!mod.requires) return
  expect(Array.isArray(mod.requires)).toBe(true)
  for (const dep of mod.requires) {
    expect(dep, `requires entry shape: ${dep}`).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(dep, `requires can't reference self: ${mod.id}`).not.toBe(mod.id)
  }
}

/**
 * Each declared route has a non-empty `path` and either an `element`
 * (eager / lazy-wrapped JSX) or a `lazy` loader. Empty `routes: []` is
 * legal — some pure-domain modules (`narrative`, `risk`, `ha`) declare
 * the field empty rather than omit it.
 */
export function assertRoutes(mod: ModuleDefinition): void {
  if (!mod.routes) return
  const seen = new Set<string>()
  for (const r of mod.routes) {
    expect(r.path, `${mod.id} route.path`).toBeTypeOf('string')
    expect((r.path ?? '').length, `${mod.id} route.path non-empty`).toBeGreaterThan(0)
    expect(r.path!.startsWith('/'), `${mod.id} route.path leading slash: ${r.path}`).toBe(true)
    expect(seen.has(r.path!), `${mod.id} route paths unique: ${r.path}`).toBe(false)
    seen.add(r.path!)
    const hasRender = r.element !== undefined || (r as { lazy?: unknown }).lazy !== undefined
    expect(hasRender, `${mod.id} route ${r.path} has element or lazy`).toBe(true)
  }
}

/**
 * Each declared nav item has label, path, icon, and a valid group.
 * `useBadge`, when present, must be a function (call signature checked
 * separately — calling it requires React render context). Empty
 * `navItems: []` is legal — see assertRoutes for the same reasoning.
 */
export function assertNavItems(mod: ModuleDefinition): void {
  if (!mod.navItems) return
  for (const item of mod.navItems) {
    expect(item.label, `${mod.id} nav.label`).toBeTypeOf('string')
    expect(item.label.length).toBeGreaterThan(0)
    expect(item.path, `${mod.id} nav.path`).toMatch(/^\//)
    // lucide-react icons are forwardRef objects; plain function components
    // are also valid. Either passes.
    const iconKind = typeof item.icon
    expect(
      iconKind === 'function' || (iconKind === 'object' && item.icon !== null),
      `${mod.id} nav.icon is a React component`,
    ).toBe(true)
    expect(VALID_NAV_GROUPS.has(item.group), `${mod.id} nav.group: ${item.group}`).toBe(true)
    if (item.useBadge !== undefined) {
      expect(item.useBadge, `${mod.id} nav.useBadge is function`).toBeTypeOf('function')
    }
  }
}

/**
 * Each `RecordTypeRegistration` carries a stable `typeName` and a Zod
 * schema. (The contract uses `typeName`, not `type` or `label` — see
 * src/modules/_registry/ModuleDefinition.ts.)
 */
export function assertRecordTypes(mod: ModuleDefinition): void {
  if (!mod.recordTypes) return
  expect(mod.recordTypes.length).toBeGreaterThan(0)
  const seen = new Set<string>()
  for (const rt of mod.recordTypes) {
    expect(rt.typeName, `${mod.id} recordType.typeName`).toBeTypeOf('string')
    expect(rt.typeName.length).toBeGreaterThan(0)
    expect(seen.has(rt.typeName), `${mod.id} recordType.typeName unique`).toBe(false)
    seen.add(rt.typeName)
    expect(rt.schema, `${mod.id} recordType.schema (Zod)`).toBeDefined()
    expect(rt.schema instanceof z.ZodType, `${mod.id} recordType.schema is Zod`).toBe(true)
    if (rt.syncable !== undefined) expect(rt.syncable).toBeTypeOf('boolean')
    if (rt.migrate  !== undefined) expect(rt.migrate ).toBeTypeOf('function')
  }
}

/**
 * `onActivate` / `onDeactivate`, if declared, must be functions. We
 * invoke each with a synthetic propertyId to confirm it's callable,
 * but do NOT require it to succeed — real-world hooks may legitimately
 * fail in a test environment (e.g. ai's onActivate reads localStorage
 * to check for an OpenRouter key; ha's onActivate installs focus
 * polling that needs a real `window`). Swallowing here keeps the
 * contract focused on shape, not runtime semantics.
 */
export async function assertLifecycle(mod: ModuleDefinition): Promise<void> {
  for (const hook of ['onActivate', 'onDeactivate'] as const) {
    const fn = mod[hook]
    if (fn === undefined) continue
    expect(fn, `${mod.id}.${hook} is function`).toBeTypeOf('function')
    try {
      const result = fn('test-property-id')
      if (result && typeof (result as Promise<void>).then === 'function') {
        await (result as Promise<void>).catch(() => undefined)
      }
    } catch {
      // Allowed — see comment above. The test verifies hook-shape, not
      // hook-success.
    }
  }
}

/**
 * One-stop shop for the per-module suite — calls every helper above.
 * Per-module test files should still add their own module-specific
 * assertions on top of this baseline.
 */
export async function assertFullContract(mod: ModuleDefinition): Promise<void> {
  assertModuleContract(mod)
  assertRequiresShape(mod)
  assertRoutes(mod)
  assertNavItems(mod)
  assertRecordTypes(mod)
  await assertLifecycle(mod)
}
