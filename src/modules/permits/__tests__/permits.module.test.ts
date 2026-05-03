import { describe, it, expect } from 'vitest'
import { PermitsModule } from '@/modules/permits'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('PermitsModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(PermitsModule)
  })

  it('declares the expected id', () => {
    expect(PermitsModule.id).toBe('permits')
  })
})
