/**
 * End-to-end tests for the vault's sync engine.
 *
 * These are the functional tests the architectural plan calls for —
 * they exercise push/pull/conflict resolution through the full stack
 * (local index + registry + memory adapter) without touching the DOM
 * or localStorage. The same scenarios run against a disk-backed
 * adapter in `diskAdapter.test.ts`; any behavior change should surface
 * in both.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createLocalIndex, type LocalIndex } from '../core/localIndex'
import { createMemoryAdapter } from '../adapters/memoryAdapter'
import { pushPending, pullFromDrive, syncAll } from '../core/syncEngine'
import type { AuditLogger, HostMetadataStore, StorageAdapter, VaultRegistry } from '../core/types'

import { testRegistry, testHost, memoryKV, makeVendorRecord, recordingAudit } from './testFixtures'

interface Ctx {
  storage: StorageAdapter
  localIndex: LocalIndex
  registry: VaultRegistry
  host: HostMetadataStore
  audit: AuditLogger
  deviceId: string
}

const TEST_DEVICE = 'device-test'

function makeCtx(): Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] } {
  const storage = createMemoryAdapter()
  const localIndex = createLocalIndex({
    kvStore: memoryKV(),
    now: () => '2026-04-20T00:00:00.000Z',
    deviceId: TEST_DEVICE,
  })
  const registry = testRegistry()
  const host = testHost({ 'prop-1': 'root-1', 'prop-empty': null })
  const { logger, entries } = recordingAudit()
  return { storage, localIndex, registry, host, audit: logger, deviceId: TEST_DEVICE, auditEntries: entries }
}

describe('vault/syncEngine — push', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  it('uploads a pending record and marks it synced', async () => {
    ctx.localIndex.upsert(makeVendorRecord())
    const result = await pushPending(ctx)
    assert.equal(result.uploaded, 1)
    assert.equal(result.failed, 0)
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'synced')
    assert.ok(r.driveFileId)
    assert.ok(r.driveEtag)
  })

  it('writes JSON to the variant-aware folder', async () => {
    ctx.localIndex.upsert(makeVendorRecord())
    await pushPending(ctx)
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files = await ctx.storage.listFiles(folderId)
    assert.equal(files.length, 1)
    assert.ok(files[0].name.endsWith('.json'))
  })

  it('silently skips records whose property has no root folder', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ propertyId: 'prop-empty' }))
    const result = await pushPending(ctx)
    assert.equal(result.uploaded, 0)
    assert.equal(result.failed, 0)
    // record stays pending — we didn't push it
    assert.equal(ctx.localIndex.getPending().length, 1)
  })

  it('heals missing filename/rootFolderId/categoryId on first push', async () => {
    // Legacy record without the Drive metadata fields
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC' },
    }))
    await pushPending(ctx)
    const r = ctx.localIndex.getById('v1')!
    assert.equal((r.data as Record<string, unknown>).filename, 'vendor_v1.json')
    assert.equal((r.data as Record<string, unknown>).rootFolderId, 'root-1')
    assert.equal((r.data as Record<string, unknown>).categoryId, 'vendor')
  })

  it('upload errors are surfaced in `errors` and the record stays pending', async () => {
    const brokenAdapter: StorageAdapter = {
      ...ctx.storage,
      uploadFile: async () => { throw new Error('network down') },
    }
    ctx.localIndex.upsert(makeVendorRecord())
    const result = await pushPending({ ...ctx, storage: brokenAdapter })
    assert.equal(result.uploaded, 0)
    assert.equal(result.failed, 1)
    assert.match(result.errors[0], /network down/)
    assert.equal(ctx.localIndex.getById('v1')!.syncState, 'pending_upload')
  })
})

describe('vault/syncEngine — pull', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  it('restores records from Drive into a fresh index', async () => {
    // Seed one record in the adapter as if another device uploaded it
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    await ctx.storage.uploadFile(folderId, 'vendor_v9.json', JSON.stringify({
      id: 'v9', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: { id: 'v9', name: 'Imported' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00.000Z',
    }), 'application/json')

    const result = await pullFromDrive(ctx, 'prop-1')
    assert.equal(result.pulled, 1)
    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.title, 'Imported')
    assert.equal(r.syncState, 'synced')
    assert.ok(r.driveFileId)
  })

  it('idempotent — already-known files are not re-downloaded', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const { id: fileId } = await ctx.storage.uploadFile(folderId, 'vendor_v9.json', JSON.stringify({
      id: 'v9', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: {}, syncState: 'synced',
      localUpdatedAt: '2026-04-19T00:00:00.000Z',
    }), 'application/json')
    // Mark it as already known locally
    ctx.localIndex.upsert({
      id: 'v9', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: {}, syncState: 'synced',
      driveFileId: fileId,
    })

    const r1 = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r1.pulled, 0)
  })

  it('skips non-.json files', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    await ctx.storage.uploadFile(folderId, 'notes.md', '# hi', 'text/markdown')
    const result = await pullFromDrive(ctx, 'prop-1')
    assert.equal(result.pulled, 0)
    assert.equal(ctx.localIndex.getAllForProperty('prop-1').length, 0)
  })

  it('returns 0/0 when property has no root folder', async () => {
    const result = await pullFromDrive(ctx, 'prop-empty')
    assert.deepEqual(result, { pulled: 0, failed: 0 })
  })

  it('scans legacy folder names too', async () => {
    const folderId = await ctx.storage.resolveFolderId('Equipment', 'root-1')
    await ctx.storage.uploadFile(folderId, 'equip_e1.json', JSON.stringify({
      id: 'e1', type: 'equipment', propertyId: 'prop-1',
      title: 'Generator', data: {}, syncState: 'synced',
      localUpdatedAt: '2026-04-19T00:00:00.000Z',
    }), 'application/json')
    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 1)
  })
})

describe('vault/syncEngine — conflict resolution', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  async function uploadRemote(data: Record<string, unknown>): Promise<{ id: string; etag: string }> {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    return ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data, syncState: 'synced',
      localUpdatedAt: '2026-04-19T00:00:00.000Z',
    }), 'application/json')
  }

  it('auto-merges when local and remote mutate disjoint fields', async () => {
    // 1. Upload v1 remotely
    const { id, etag } = await uploadRemote({ id: 'v1', name: 'Ohio HVAC', phone: '555-1234' })
    // 2. Local believes ETag is the v1 etag, but another client bumps it
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-1234', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor', notes: 'prefers morning' },
      driveFileId: id, driveEtag: etag,
    }))
    // 3. Remote writes a disjoint field (rating), bumping etag to v2
    await ctx.storage.updateFile(id, JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-1234', rating: 5 },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00.000Z',
    }), 'application/json')

    // 4. Local push — should hit 412, then auto-merge (no overlap: local adds notes, remote added rating)
    const result = await pushPending(ctx)
    assert.equal(result.uploaded, 0)  // the initial upload failed
    const mergedInfo = ctx.auditEntries.find(e => e.action === 'sync.conflict')
    assert.ok(mergedInfo, 'auto-merge audit entry expected')
    assert.equal(mergedInfo?.level, 'info')

    // Record is now synced with merged data
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'synced')
    const merged = await ctx.storage.downloadFile(id)
    const parsed = JSON.parse(merged.content) as { data: Record<string, unknown> }
    assert.equal(parsed.data.notes, 'prefers morning')
    assert.equal(parsed.data.rating, 5)
  })

  it('splits into v2 copy when same field mutated on both sides', async () => {
    const { id, etag } = await uploadRemote({ id: 'v1', name: 'Ohio HVAC', phone: '555-1234' })
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-9999', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: id, driveEtag: etag,
    }))
    // Remote changes phone too — same field, different value
    await ctx.storage.updateFile(id, JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'v1', name: 'Ohio HVAC', phone: '555-7777' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00.000Z',
    }), 'application/json')

    await pushPending(ctx)

    // Original is flagged as conflict and linked to v2
    const original = ctx.localIndex.getById('v1')!
    assert.equal(original.syncState, 'conflict')
    assert.ok(original.conflictWithId?.startsWith('conflict_v2_v1_'))
    assert.equal(ctx.localIndex.getConflicts().length, 1)

    // v2 is stored in the adapter too
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files = await ctx.storage.listFiles(folderId)
    assert.ok(files.some(f => /_v2_\d+\.json$/.test(f.name)))

    const warn = ctx.auditEntries.find(e => e.level === 'warn' && e.action === 'sync.conflict')
    assert.ok(warn, 'conflict warn audit entry expected')
  })
})

describe('vault/syncEngine — full sync', () => {
  it('pulls then pushes in one call and audits the summary', async () => {
    const ctx = makeCtx()
    // Remote has one file, local has a pending record
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    await ctx.storage.uploadFile(folderId, 'vendor_imported.json', JSON.stringify({
      id: 'imp', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: {}, syncState: 'synced',
      localUpdatedAt: '2026-04-19T00:00:00Z',
    }), 'application/json')
    ctx.localIndex.upsert(makeVendorRecord())

    const result = await syncAll(ctx, 'prop-1')
    assert.equal(result.pulled, 1)
    assert.equal(result.uploaded, 1)
    assert.ok(ctx.auditEntries.some(e => e.action === 'sync' && e.level === 'info'))
  })
})
