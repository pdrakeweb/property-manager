import { describe, it, expect } from 'vitest'
import { HomeBookModule } from '@/modules/homebook'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('HomeBookModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(HomeBookModule)
  })

  it('declares the expected id', () => {
    expect(HomeBookModule.id).toBe('homebook')
  })
  it('exposes the homeBook lib used by the export route', async () => {
    const hb = await import('@/lib/homeBook')
    expect(typeof hb.collectHomeBook).toBe('function')
  })
})
