import { describe, it, expect } from 'vitest'
import { InventoryModule } from '@/modules/inventory'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('InventoryModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(InventoryModule)
  })

  it('declares the expected id', () => {
    expect(InventoryModule.id).toBe('inventory')
  })
})
