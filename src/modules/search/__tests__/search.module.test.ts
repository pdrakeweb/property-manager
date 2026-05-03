import { describe, it, expect } from 'vitest'
import { SearchModule } from '@/modules/search'
import { assertFullContract } from '@/modules/__tests__/moduleContract'

describe('SearchModule', () => {
  it('passes the ModuleDefinition contract', async () => {
    await assertFullContract(SearchModule)
  })

  it('declares the expected id', () => {
    expect(SearchModule.id).toBe('search')
  })
  it('declares at least one /search* route', () => {
    const paths = (SearchModule.routes ?? []).map(r => r.path ?? '')
    expect(paths.some(p => p.includes('search'))).toBe(true)
  })
})
