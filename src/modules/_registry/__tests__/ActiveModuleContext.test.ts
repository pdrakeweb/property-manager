import { describe, it, expect } from 'vitest'
import {
  defaultPropertyModules,
  computeToggle,
  moduleRegistry,
} from '@/modules/_registry'
import '@/modules' // populate the registry

describe('defaultPropertyModules', () => {
  it('returns all registered ids enabled', () => {
    const defaults = defaultPropertyModules()
    const registered = moduleRegistry.getAll().map(m => m.id)
    for (const id of registered) {
      expect(defaults[id], `${id} default-enabled`).toBe(true)
    }
  })

  it('every value is `true` (no surprises)', () => {
    const defaults = defaultPropertyModules()
    for (const [id, on] of Object.entries(defaults)) {
      expect(on, `${id} default value`).toBe(true)
    }
  })
})

describe('computeToggle — turn ON', () => {
  it('cascades dependencies on (turning ON contents pulls ai in if absent)', () => {
    const prev = { contents: false, ai: false }
    const next = computeToggle(prev, 'contents')
    expect(next.contents).toBe(true)
    expect(next.ai      ).toBe(true)
  })

  it('does not cascade when deps are already enabled', () => {
    const prev = { contents: false, ai: true }
    const next = computeToggle(prev, 'contents')
    expect(next.contents).toBe(true)
    expect(next.ai      ).toBe(true)
  })

  it('idempotent: toggling on a module already-on flips it off', () => {
    // computeToggle interprets the current bool as "intended state" and
    // flips it, so this verifies the flip semantic — it's NOT idempotent
    // in the "always returns true" sense.
    const prev = { contents: true, ai: true }
    const next = computeToggle(prev, 'contents')
    expect(next.contents).toBe(false)
  })
})

describe('computeToggle — turn OFF', () => {
  it('cascades dependents off (turning OFF ai disables contents/import/risk)', () => {
    // ai has at least three direct dependents in the merged registry:
    // contents, import, risk. Turning ai off must take all three with it.
    const prev = { ai: true, contents: true, import: true, risk: true }
    const next = computeToggle(prev, 'ai')
    expect(next.ai      ).toBe(false)
    expect(next.contents).toBe(false)
    expect(next.import  ).toBe(false)
    expect(next.risk    ).toBe(false)
  })

  it('preserves unrelated modules when cascading off', () => {
    const prev = { ai: true, contents: true, capital: true, calendar: true }
    const next = computeToggle(prev, 'ai')
    expect(next.capital ).toBe(true)
    expect(next.calendar).toBe(true)
  })
})

describe('computeToggle — required modules', () => {
  it('cannot toggle off `core` (required)', () => {
    const prev = { core: true, capital: true }
    const next = computeToggle(prev, 'core')
    // Required-module toggle is a no-op (per the file's design comment),
    // so the input map is returned unchanged.
    expect(next).toEqual(prev)
  })

  it('returns the same object when toggle is a no-op (required)', () => {
    const prev = { core: true }
    const next = computeToggle(prev, 'core')
    // Identity check — reference equality matters because the React
    // setState callback in the provider relies on it to skip re-renders.
    expect(next).toBe(prev)
  })
})
