import { describe, it, expect } from 'vitest'
import {
  expandWithDeps,
  getActivationOrder,
  assertNoCycles,
  moduleRegistry,
} from '@/modules/_registry'
import '@/modules' // populate the registry

describe('expandWithDeps', () => {
  it('always includes core, even when nothing is enabled', () => {
    const ids = expandWithDeps({})
    expect(ids.has('core')).toBe(true)
  })

  it('always includes core, even when core is explicitly disabled', () => {
    // Required modules cannot be disabled — `expandWithDeps` enforces
    // the floor regardless of the user's flags.
    const ids = expandWithDeps({ core: false })
    expect(ids.has('core')).toBe(true)
  })

  it('walks `requires` transitively (BFS completeness)', () => {
    // contents requires ai (per the contents module declaration)
    // import requires ai
    // risk requires ai
    const ids = expandWithDeps({ contents: true })
    expect(ids.has('contents')).toBe(true)
    expect(ids.has('ai')).toBe(true)
  })

  it('idempotent: same input → same output', () => {
    const a = expandWithDeps({ ai: true, capital: true })
    const b = expandWithDeps({ ai: true, capital: true })
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('disabled modules are excluded (except always-active core)', () => {
    const ids = expandWithDeps({ capital: false, ai: false })
    expect(ids.has('capital')).toBe(false)
    expect(ids.has('ai')).toBe(false)
  })
})

describe('getActivationOrder', () => {
  it('produces post-order (deps before dependents)', () => {
    // contents requires ai → ai must come before contents in activation
    const active = expandWithDeps({ contents: true })
    const ordered = getActivationOrder(active)
    const ids = ordered.map(m => m.id)
    const aiIdx       = ids.indexOf('ai')
    const contentsIdx = ids.indexOf('contents')
    expect(aiIdx).toBeGreaterThanOrEqual(0)
    expect(contentsIdx).toBeGreaterThanOrEqual(0)
    expect(aiIdx).toBeLessThan(contentsIdx)
  })

  it('skips modules not in the active set', () => {
    const ordered = getActivationOrder(new Set(['core']))
    const ids = ordered.map(m => m.id)
    expect(ids).toEqual(['core'])
  })

  it('returns ModuleDefinition objects, not just ids', () => {
    const ordered = getActivationOrder(new Set(['core']))
    expect(ordered[0]?.name).toBe('Core')
    expect(typeof ordered[0]?.icon).toBe('string')
  })
})

describe('assertNoCycles', () => {
  it('passes on the real registry', () => {
    expect(() => assertNoCycles()).not.toThrow()
  })

  it('throws when a synthetic cycle is injected', () => {
    // Inject a cycle by registering two modules that require each other.
    // We add to the real registry (no per-test instance API) but the
    // duplicate-warn semantics let us push these unique ids in safely;
    // we don't bother removing them because this is the last test in
    // the suite that touches the cycle assertion.
    const A: import('@/modules/_registry').ModuleDefinition = {
      id: 'cycle-a', name: 'Cycle A',
      description: 'Synthetic cycle test fixture, long enough to satisfy the description-length contract.',
      version: '0.0.0', category: 'tools', icon: '♻️', capabilities: ['cycle'],
      requires: ['cycle-b'],
    }
    const B: import('@/modules/_registry').ModuleDefinition = {
      id: 'cycle-b', name: 'Cycle B',
      description: 'Synthetic cycle test fixture, long enough to satisfy the description-length contract.',
      version: '0.0.0', category: 'tools', icon: '♻️', capabilities: ['cycle'],
      requires: ['cycle-a'],
    }
    moduleRegistry.register(A)
    moduleRegistry.register(B)
    expect(() => assertNoCycles()).toThrow(/Module dependency cycle detected.*cycle-a.*cycle-b|cycle-b.*cycle-a/)
  })
})
