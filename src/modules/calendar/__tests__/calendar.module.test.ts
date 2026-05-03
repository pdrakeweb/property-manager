import { describe, it, expect } from 'vitest'
import { CalendarModule } from '@/modules/calendar'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('CalendarModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(CalendarModule)
  })

  it('declares the expected id', () => {
    expect(CalendarModule.id).toBe('calendar')
  })
  it('declares at least one /calendar* route', () => {
    const paths = (CalendarModule.routes ?? []).map(r => r.path ?? '')
    expect(paths.some(p => p.includes('calendar'))).toBe(true)
  })
})
