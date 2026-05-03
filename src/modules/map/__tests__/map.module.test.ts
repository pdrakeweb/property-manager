import { describe, it, expect } from 'vitest'
import { MapModule } from '@/modules/map'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('MapModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(MapModule)
  })

  it('declares the expected id', () => {
    expect(MapModule.id).toBe('map')
  })
})
