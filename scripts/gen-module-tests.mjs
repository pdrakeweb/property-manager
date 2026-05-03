// One-off generator: emits a baseline contract test for each of the 26
// modules. Run via `node scripts/gen-module-tests.mjs` from the repo
// root. Intentionally idempotent — re-running overwrites.

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/** module-id → exported-symbol-name in `<id>/index.{ts,tsx}` */
const MODULES = {
  ai:           'AIModule',
  calendar:     'CalendarModule',
  capital:      'CapitalModule',
  contents:     'ContentsModule',
  core:         'CoreModule',
  expiry:       'ExpiryModule',
  fuel:         'FuelModule',
  generator:    'GeneratorModule',
  ha:           'HaModule',
  homebook:     'HomeBookModule',
  import:       'ImportModule',
  insurance:    'InsuranceModule',
  inventory:    'InventoryModule',
  maintenance:  'MaintenanceModule',
  map:          'MapModule',
  mortgage:     'MortgageModule',
  narrative:    'NarrativeModule',
  permits:      'PermitsModule',
  risk:         'RiskModule',
  road:         'RoadModule',
  search:       'SearchModule',
  septic:       'SepticModule',
  tax:          'TaxModule',
  utility:      'UtilityModule',
  vendor:       'VendorModule',
  well:         'WellModule',
}

/** Per-module extra blocks that go after `assertFullContract`. */
const EXTRAS = {
  ai: `
  it('exposes AI lib helpers used by the module routes', async () => {
    const ca = await import('@/lib/conditionAssessment')
    expect(typeof ca.assessCondition).toBe('function')
    const re = await import('@/lib/riskEngine')
    expect(typeof re.generateRiskBrief).toBe('function')
  })`,

  calendar: `
  it('declares at least one /calendar* route', () => {
    const paths = (CalendarModule.routes ?? []).map(r => r.path ?? '')
    expect(paths.some(p => p.includes('calendar'))).toBe(true)
  })`,

  contents: `
  it('declares requires: ["ai"]', () => {
    expect(ContentsModule.requires).toContain('ai')
  })`,

  core: `
  it('is required and cannot be disabled', () => {
    expect(CoreModule.required).toBe(true)
  })

  it('passes assertNoCycles for the live registry', async () => {
    const { assertNoCycles } = await import('@/modules/_registry')
    expect(() => assertNoCycles()).not.toThrow()
  })

  it('declares Dashboard, Settings, Sync, Search routes', () => {
    const paths = (CoreModule.routes ?? []).map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/sync')
    expect(paths).toContain('/search')
  })`,

  ha: `
  it('declares ha_threshold + ha_alert recordTypes (both local-only)', () => {
    const types = (HaModule.recordTypes ?? []).map(rt => rt.typeName)
    expect(types).toContain('ha_threshold')
    expect(types).toContain('ha_alert')
    for (const rt of HaModule.recordTypes ?? []) {
      expect(rt.syncable, \`\${rt.typeName} is local-only\`).toBe(false)
    }
  })

  it('onDeactivate does not throw even if onActivate was never called', () => {
    expect(() => HaModule.onDeactivate?.('test-property')).not.toThrow()
  })`,

  homebook: `
  it('exposes the homeBook lib used by the export route', async () => {
    const hb = await import('@/lib/homeBook')
    expect(typeof hb.collectHomeBook).toBe('function')
  })`,

  import: `
  it('declares requires: ["ai"]', () => {
    expect(ImportModule.requires).toContain('ai')
  })

  it('exposes pollInbox via the inbox poller lib', async () => {
    const ip = await import('@/lib/inboxPoller')
    expect(typeof ip.pollInbox).toBe('function')
  })`,

  maintenance: `
  it('declares at least 4 record types (task, completed_event, checklist, checklist_item)', () => {
    const types = (MaintenanceModule.recordTypes ?? []).map(rt => rt.typeName)
    expect(types.length).toBeGreaterThanOrEqual(4)
    expect(types).toContain('task')
    expect(types).toContain('completed_event')
    expect(types).toContain('checklist')
    expect(types).toContain('checklist_item')
  })`,

  risk: `
  it('declares requires: ["ai"]', () => {
    expect(RiskModule.requires).toContain('ai')
  })

  it('exposes generateRiskBrief via the risk engine lib', async () => {
    const re = await import('@/lib/riskEngine')
    expect(typeof re.generateRiskBrief).toBe('function')
  })`,

  search: `
  it('declares at least one /search* route', () => {
    const paths = (SearchModule.routes ?? []).map(r => r.path ?? '')
    expect(paths.some(p => p.includes('search'))).toBe(true)
  })`,
}

const BASE = (id, exportName) => `import { describe, it, expect } from 'vitest'
import { ${exportName} } from '@/modules/${id}'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('${exportName}', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(${exportName})
  })

  it('declares the expected id', () => {
    expect(${exportName}.id).toBe('${id}')
  })${EXTRAS[id] ?? ''}
})
`

for (const [id, exportName] of Object.entries(MODULES)) {
  const dir  = resolve(ROOT, 'src/modules', id, '__tests__')
  const file = resolve(dir, `${id}.module.test.ts`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, BASE(id, exportName), 'utf8')
  console.log('wrote', file.replace(ROOT + '/', '').replace(/\\\\/g, '/'))
}

console.log(`\nDone — ${Object.keys(MODULES).length} module test files.`)
