import { describe, it, expect } from 'vitest'
import { RoadModule } from '@/modules/road'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('RoadModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(RoadModule)
  })

  it('declares the expected id', () => {
    expect(RoadModule.id).toBe('road')
  })
})
