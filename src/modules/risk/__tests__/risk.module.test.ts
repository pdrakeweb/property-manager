import { describe, it, expect } from 'vitest'
import { RiskModule } from '@/modules/risk'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('RiskModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(RiskModule)
  })

  it('declares the expected id', () => {
    expect(RiskModule.id).toBe('risk')
  })
  it('declares requires: ["ai"]', () => {
    expect(RiskModule.requires).toContain('ai')
  })

  it('exposes generateRiskBrief via the risk engine lib', async () => {
    const re = await import('@/lib/riskEngine')
    expect(typeof re.generateRiskBrief).toBe('function')
  })
})
