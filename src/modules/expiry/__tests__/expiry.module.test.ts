import { describe, it, expect } from 'vitest'
import { ExpiryModule } from '@/modules/expiry'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('ExpiryModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(ExpiryModule)
  })

  it('declares the expected id', () => {
    expect(ExpiryModule.id).toBe('expiry')
  })
})
