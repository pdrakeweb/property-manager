import { describe, it, expect } from 'vitest'
import { AIModule } from '@/modules/ai'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('AIModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(AIModule)
  })

  it('declares the expected id', () => {
    expect(AIModule.id).toBe('ai')
  })
  it('exposes AI lib helpers used by the module routes', async () => {
    const ca = await import('@/lib/conditionAssessment')
    expect(typeof ca.assessCondition).toBe('function')
    const re = await import('@/lib/riskEngine')
    expect(typeof re.generateRiskBrief).toBe('function')
  })
})
