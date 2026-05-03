import { describe, it, expect } from 'vitest'
import { SepticModule } from '@/modules/septic'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('SepticModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(SepticModule)
  })

  it('declares the expected id', () => {
    expect(SepticModule.id).toBe('septic')
  })
})
