import { describe, it, expect } from 'vitest'
import { moduleRegistry } from '@/modules/_registry'
import '@/modules' // populate the registry

describe('module registry smoke', () => {
  it('loads all 26 registered modules', () => {
    const ids = moduleRegistry.getAll().map(m => m.id)
    expect(ids.length).toBeGreaterThanOrEqual(26)
    expect(ids).toContain('core')
    expect(ids).toContain('expiry')
  })
})
