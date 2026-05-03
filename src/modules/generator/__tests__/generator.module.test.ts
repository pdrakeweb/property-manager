import { describe, it, expect } from 'vitest'
import { GeneratorModule } from '@/modules/generator'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('GeneratorModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(GeneratorModule)
  })

  it('declares the expected id', () => {
    expect(GeneratorModule.id).toBe('generator')
  })
})
