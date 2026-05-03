import { describe, it, expect } from 'vitest'
import { FuelModule } from '@/modules/fuel'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('FuelModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(FuelModule)
  })

  it('declares the expected id', () => {
    expect(FuelModule.id).toBe('fuel')
  })
})
