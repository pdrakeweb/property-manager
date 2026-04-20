/**
 * Functional test — markdown export writes real files through the adapter
 * and generates an index.md table, matching the legacy knowledgebase export
 * behavior.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createLocalIndex } from '../core/localIndex'
import { createMemoryAdapter } from '../adapters/memoryAdapter'
import { exportAllMarkdown } from '../core/markdownExport'
import { testRegistry, testHost, memoryKV, makeVendorRecord, recordingAudit } from './testFixtures'

describe('vault/markdownExport', () => {
  let ctx: ReturnType<typeof makeCtx>
  function makeCtx() {
    const storage = createMemoryAdapter()
    const localIndex = createLocalIndex({ kvStore: memoryKV(), now: () => '2026-04-20T00:00:00.000Z' })
    const registry = testRegistry()
    const host = testHost({ 'prop-1': 'root-1' })
    const { logger, entries } = recordingAudit()
    return { storage, localIndex, registry, host, audit: logger, auditEntries: entries }
  }

  beforeEach(() => { ctx = makeCtx() })

  it('writes one .md per record, creates index.md, counts categories', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'v1', data: { id: 'v1', name: 'Ohio HVAC', phone: '555' } }))
    ctx.localIndex.upsert(makeVendorRecord({
      id: 't1', type: 'task', title: 'Change filter',
      data: { id: 't1', title: 'Change filter', dueDate: '2026-05-01' },
    }))

    const res = await exportAllMarkdown(ctx, { propertyId: 'prop-1', propertyName: 'Home' })
    assert.equal(res.exported, 2)
    assert.equal(res.skipped, 0)
    assert.equal(res.failed, 0)

    // Both category folders exist with one md each
    const vendorsId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const tasksId   = await ctx.storage.resolveFolderId('Tasks',   'root-1')
    const vFiles = await ctx.storage.listFiles(vendorsId)
    const tFiles = await ctx.storage.listFiles(tasksId)
    assert.equal(vFiles.length, 1)
    assert.equal(tFiles.length, 1)
    assert.ok(vFiles[0].name.endsWith('.md'))

    // index.md written at the root
    const rootFiles = await ctx.storage.listFiles('root-1')
    const index = rootFiles.find(f => f.name === 'index.md')
    assert.ok(index, 'index.md should be created')
    const dl = await ctx.storage.downloadFile(index!.id)
    assert.match(dl.content, /# Home — Property Manager Knowledgebase/)
    assert.match(dl.content, /\| Vendors \| 1 \|/)
    assert.match(dl.content, /\| Tasks \| 1 \|/)
  })

  it('skips unchanged filenames on re-run', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'v1', data: { id: 'v1', name: 'Ohio HVAC' } }))
    await exportAllMarkdown(ctx, { propertyId: 'prop-1', propertyName: 'Home' })
    const res2 = await exportAllMarkdown(ctx, { propertyId: 'prop-1', propertyName: 'Home' })
    assert.equal(res2.exported, 0)
    assert.equal(res2.skipped, 1)
  })

  it('returns empty result when property has no root folder', async () => {
    const hostless = { ...ctx, host: testHost({}) }
    hostless.localIndex.upsert(makeVendorRecord())
    const res = await exportAllMarkdown(hostless, { propertyId: 'prop-1', propertyName: 'Home' })
    assert.deepEqual(res, { exported: 0, skipped: 0, failed: 0, errors: [] })
  })

  it('reports progress through onProgress callback', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'v1' }))
    ctx.localIndex.upsert(makeVendorRecord({ id: 'v2' }))
    const seen: Array<[number, number]> = []
    await exportAllMarkdown(ctx, { propertyId: 'prop-1', propertyName: 'Home' }, (c, t) => seen.push([c, t]))
    const last = seen[seen.length - 1]
    assert.equal(last[0], 2)
    assert.equal(last[1], 2)
  })
})
