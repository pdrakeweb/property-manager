/**
 * Memory adapter correctness tests.
 *
 * The memory adapter is the reference harness for the StorageAdapter
 * contract — it must behave like Drive in every way the sync engine
 * observes. If the contract ever drifts, these tests fail first.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createMemoryAdapter } from '../adapters/memoryAdapter'
import { ETagConflictError, type StorageAdapter } from '../core/types'

describe('vault/memoryAdapter', () => {
  let adapter: StorageAdapter

  beforeEach(() => {
    adapter = createMemoryAdapter()
  })

  it('resolveFolderId is idempotent', async () => {
    const a = await adapter.resolveFolderId('Vendors', 'root-1')
    const b = await adapter.resolveFolderId('Vendors', 'root-1')
    assert.equal(a, b)
  })

  it('resolveFolderId distinguishes parents', async () => {
    const a = await adapter.resolveFolderId('Vendors', 'root-1')
    const b = await adapter.resolveFolderId('Vendors', 'root-2')
    assert.notEqual(a, b)
  })

  it('uploadFile creates new file with etag v1', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const file   = await adapter.uploadFile(folder, 'a.json', '{"x":1}', 'application/json')
    assert.equal(file.name, 'a.json')
    assert.equal(file.etag, 'v1')
  })

  it('downloadFile returns content + etag', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const up = await adapter.uploadFile(folder, 'a.json', '{"x":1}', 'application/json')
    const dl = await adapter.downloadFile(up.id)
    assert.equal(dl.content, '{"x":1}')
    assert.equal(dl.etag, 'v1')
  })

  it('listFiles returns only files in that folder', async () => {
    const f1 = await adapter.resolveFolderId('A', 'root-1')
    const f2 = await adapter.resolveFolderId('B', 'root-1')
    await adapter.uploadFile(f1, 'x.json', 'x', 'application/json')
    await adapter.uploadFile(f2, 'y.json', 'y', 'application/json')
    const items = await adapter.listFiles(f1)
    assert.equal(items.length, 1)
    assert.equal(items[0].name, 'x.json')
  })

  it('re-upload without If-Match overwrites and bumps etag', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const v1 = await adapter.uploadFile(folder, 'a.json', 'first', 'application/json')
    const v2 = await adapter.uploadFile(folder, 'a.json', 'second', 'application/json')
    assert.equal(v1.etag, 'v1')
    assert.equal(v2.etag, 'v2')
    const dl = await adapter.downloadFile(v2.id)
    assert.equal(dl.content, 'second')
  })

  it('If-Match matching etag succeeds', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const v1 = await adapter.uploadFile(folder, 'a.json', 'first', 'application/json')
    const v2 = await adapter.uploadFile(folder, 'a.json', 'second', 'application/json', v1.etag)
    assert.equal(v2.etag, 'v2')
  })

  it('If-Match with stale etag throws ETagConflictError carrying latest content', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const v1 = await adapter.uploadFile(folder, 'a.json', 'first', 'application/json')
    // Someone else bumps it
    await adapter.uploadFile(folder, 'a.json', 'other', 'application/json')
    await assert.rejects(
      () => adapter.uploadFile(folder, 'a.json', 'mine', 'application/json', v1.etag),
      (err) => {
        assert.ok(err instanceof ETagConflictError)
        assert.equal((err as ETagConflictError).latestContent, 'other')
        return true
      },
    )
  })

  it('updateFile bumps etag', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    const up = await adapter.uploadFile(folder, 'a.json', 'x', 'application/json')
    await adapter.updateFile(up.id, 'y', 'application/json')
    const dl = await adapter.downloadFile(up.id)
    assert.equal(dl.content, 'y')
    assert.equal(dl.etag, 'v2')
  })

  it('searchFiles parses name= predicate', async () => {
    const folder = await adapter.resolveFolderId('Vendors', 'root-1')
    await adapter.uploadFile(folder, 'pm_audit.json', '[]', 'application/json')
    const hits = await adapter.searchFiles("name='pm_audit.json' and trashed=false")
    assert.equal(hits.length, 1)
  })

  it('listFolders returns alpha-sorted subfolders', async () => {
    await adapter.resolveFolderId('Zeta', 'root-1')
    await adapter.resolveFolderId('Alpha', 'root-1')
    const folders = await adapter.listFolders('root-1')
    assert.deepEqual(folders.map(f => f.name), ['Alpha', 'Zeta'])
  })

  it('concurrent resolveFolderId calls do not duplicate', async () => {
    const [a, b, c] = await Promise.all([
      adapter.resolveFolderId('Vendors', 'root-1'),
      adapter.resolveFolderId('Vendors', 'root-1'),
      adapter.resolveFolderId('Vendors', 'root-1'),
    ])
    assert.equal(a, b)
    assert.equal(b, c)
  })
})
