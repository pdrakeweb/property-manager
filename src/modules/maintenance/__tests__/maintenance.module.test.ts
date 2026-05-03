import { describe, it, expect } from 'vitest'
import { MaintenanceModule } from '@/modules/maintenance'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('MaintenanceModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(MaintenanceModule)
  })

  it('declares the expected id', () => {
    expect(MaintenanceModule.id).toBe('maintenance')
  })
  it('declares at least 4 record types (task, completed_event, checklist, checklist_item)', () => {
    const types = (MaintenanceModule.recordTypes ?? []).map(rt => rt.typeName)
    expect(types.length).toBeGreaterThanOrEqual(4)
    expect(types).toContain('task')
    expect(types).toContain('completed_event')
    expect(types).toContain('checklist')
    expect(types).toContain('checklist_item')
  })
})
