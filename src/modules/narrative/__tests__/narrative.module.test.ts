import { describe, it, expect } from 'vitest'
import { NarrativeModule } from '@/modules/narrative'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('NarrativeModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(NarrativeModule)
  })

  it('declares the expected id', () => {
    expect(NarrativeModule.id).toBe('narrative')
  })
})
