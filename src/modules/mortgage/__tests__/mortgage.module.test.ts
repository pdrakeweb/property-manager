import { describe, it, expect } from 'vitest'
import { MortgageModule } from '@/modules/mortgage'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('MortgageModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(MortgageModule)
  })

  it('declares the expected id', () => {
    expect(MortgageModule.id).toBe('mortgage')
  })
})
