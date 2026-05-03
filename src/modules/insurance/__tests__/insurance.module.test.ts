import { describe, it, expect } from 'vitest'
import { InsuranceModule } from '@/modules/insurance'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('InsuranceModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(InsuranceModule)
  })

  it('declares the expected id', () => {
    expect(InsuranceModule.id).toBe('insurance')
  })
})
