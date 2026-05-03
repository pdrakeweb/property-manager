import { describe, it, expect } from 'vitest'
import { CoreModule } from '@/modules/core'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('CoreModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(CoreModule)
  })

  it('declares the expected id', () => {
    expect(CoreModule.id).toBe('core')
  })
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
  })
})
