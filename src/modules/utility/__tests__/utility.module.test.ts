import { describe, it, expect } from 'vitest'
import { UtilityModule } from '@/modules/utility'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('UtilityModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(UtilityModule)
  })

  it('declares the expected id', () => {
    expect(UtilityModule.id).toBe('utility')
  })
})
