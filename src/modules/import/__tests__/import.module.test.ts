import { describe, it, expect } from 'vitest'
import { ImportModule } from '@/modules/import'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('ImportModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(ImportModule)
  })

  it('declares the expected id', () => {
    expect(ImportModule.id).toBe('import')
  })
  it('declares requires: ["ai"]', () => {
    expect(ImportModule.requires).toContain('ai')
  })

  it('exposes pollInbox via the inbox poller lib', async () => {
    const ip = await import('@/lib/inboxPoller')
    expect(typeof ip.pollInbox).toBe('function')
  })
})
