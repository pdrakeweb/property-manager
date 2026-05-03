import { describe, it, expect } from 'vitest'
import { VendorModule } from '@/modules/vendor'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('VendorModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(VendorModule)
  })

  it('declares the expected id', () => {
    expect(VendorModule.id).toBe('vendor')
  })
})
