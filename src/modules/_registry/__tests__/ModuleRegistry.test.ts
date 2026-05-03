import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { moduleRegistry } from '@/modules/_registry'
import type { ModuleDefinition } from '@/modules/_registry'
import '@/modules' // populate the registry

function fakeMod(id: string, overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id,
    name:        `Fake ${id}`,
    description: 'A synthetic module created in a unit test, long enough to satisfy the description-length contract.',
    version:     '0.0.0',
    category:    'tools',
    icon:        '🧪',
    capabilities: ['fake'],
    ...overrides,
  }
}

describe('ModuleRegistry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined) })
  afterEach (() => { warnSpy.mockRestore() })

  it('getAll returns insertion-ordered modules and includes every registered id', () => {
    const all = moduleRegistry.getAll()
    expect(all.length).toBeGreaterThanOrEqual(26)
    // First entry is `core` — it's registered first by the discovery
    // barrel and the registry preserves insertion order.
    expect(all[0]?.id).toBe('core')
    const ids = new Set(all.map(m => m.id))
    for (const expected of ['core', 'maintenance', 'ai', 'capital', 'inventory', 'expiry']) {
      expect(ids.has(expected), `expected ${expected} registered`).toBe(true)
    }
  })

  it('get(id) returns the registered definition; missing ids return null (NOT undefined)', () => {
    const core = moduleRegistry.get('core')
    expect(core).not.toBeNull()
    expect(core!.id).toBe('core')

    // Contract says null on miss — test is explicit so a regression to
    // `undefined` would be caught.
    expect(moduleRegistry.get('does-not-exist')).toBeNull()
  })

  it('register warns on duplicate id and keeps the original definition', () => {
    const original = moduleRegistry.get('core')!
    const impostor = fakeMod('core', { name: 'Impostor Core' })

    moduleRegistry.register(impostor)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/duplicate registration ignored: core/)
    // First registration wins — the impostor was dropped.
    expect(moduleRegistry.get('core')).toBe(original)
    expect(moduleRegistry.get('core')!.name).not.toBe('Impostor Core')
  })

  it('duplicate-warn does NOT throw (HMR safety contract)', () => {
    const dup = fakeMod('maintenance')
    expect(() => moduleRegistry.register(dup)).not.toThrow()
  })
})
