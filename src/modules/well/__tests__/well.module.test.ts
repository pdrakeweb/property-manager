import { describe, it, expect } from 'vitest'
import { WellModule } from '@/modules/well'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('WellModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(WellModule)
  })

  it('declares the expected id', () => {
    expect(WellModule.id).toBe('well')
  })
})
