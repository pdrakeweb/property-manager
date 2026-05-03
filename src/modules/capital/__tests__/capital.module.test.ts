import { describe, it, expect } from 'vitest'
import { CapitalModule } from '@/modules/capital'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('CapitalModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(CapitalModule)
  })

  it('declares the expected id', () => {
    expect(CapitalModule.id).toBe('capital')
  })
})
