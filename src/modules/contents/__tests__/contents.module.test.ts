import { describe, it, expect } from 'vitest'
import { ContentsModule } from '@/modules/contents'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('ContentsModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(ContentsModule)
  })

  it('declares the expected id', () => {
    expect(ContentsModule.id).toBe('contents')
  })
  it('declares requires: ["ai"]', () => {
    expect(ContentsModule.requires).toContain('ai')
  })
})
