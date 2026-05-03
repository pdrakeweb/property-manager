import { describe, it, expect } from 'vitest'
import { TaxModule } from '@/modules/tax'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('TaxModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(TaxModule)
  })

  it('declares the expected id', () => {
    expect(TaxModule.id).toBe('tax')
  })
})
