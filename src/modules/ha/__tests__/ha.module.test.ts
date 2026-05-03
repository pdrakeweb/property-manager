import { describe, it, expect } from 'vitest'
import { HaModule } from '@/modules/ha'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('HaModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(HaModule)
  })

  it('declares the expected id', () => {
    expect(HaModule.id).toBe('ha')
  })
  it('declares ha_threshold + ha_alert recordTypes (both local-only)', () => {
    const types = (HaModule.recordTypes ?? []).map(rt => rt.typeName)
    expect(types).toContain('ha_threshold')
    expect(types).toContain('ha_alert')
    for (const rt of HaModule.recordTypes ?? []) {
      expect(rt.syncable, `${rt.typeName} is local-only`).toBe(false)
    }
  })

  it('onDeactivate does not throw even if onActivate was never called', () => {
    expect(() => HaModule.onDeactivate?.('test-property')).not.toThrow()
  })
})
