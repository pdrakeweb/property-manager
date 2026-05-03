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
import { pushPending, pullFromDrive, syncAll, mergeRemoteRecord } from '../core/syncEngine'
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

  it('returns 0/0/0 when property has no root folder', async () => {
    const result = await pullFromDrive(ctx, 'prop-empty')
    assert.deepEqual(result, { pulled: 0, failed: 0, conflicts: 0 })
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

describe('vault/syncEngine — vclock conflict resolution', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  async function uploadRemote(data: Record<string, unknown>, vclock: Record<string, number>): Promise<{ id: string; etag: string }> {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    return ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data, syncState: 'synced',
      localUpdatedAt: '2026-04-19T00:00:00.000Z',
      vclock,
    }), 'application/json')
  }

  it('push: ETag conflict + concurrent vclocks → conflict state with field-level diff', async () => {
    // Remote has its own write history (device-other bumped twice).
    const { id, etag } = await uploadRemote(
      { id: 'v1', name: 'Ohio HVAC', phone: '555-1234' },
      { 'device-other': 2 },
    )
    // Local also edited concurrently — TEST_DEVICE bumped once on top of the
    // pre-merge baseline, so its vclock is { TEST_DEVICE: 1 }. The clocks are
    // concurrent (neither dominates).
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-9999', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: id, driveEtag: etag,
    }))
    // Remote moved past our last-known etag.
    await ctx.storage.updateFile(id, JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-7777' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00.000Z',
      vclock: { 'device-other': 3 },
    }), 'application/json')

    await pushPending(ctx)

    // Vclock-aware merge: this is concurrent (neither dominates). Record is
    // flagged conflict with field-level diff for the resolver UI.
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'conflict')
    assert.ok(r.conflictFields, 'conflictFields populated')
    const phoneConflict = r.conflictFields!.find(f => f.path === 'phone')
    assert.ok(phoneConflict, 'phone field appears in the conflict diff')
    assert.equal(phoneConflict!.local,  '555-9999')
    assert.equal(phoneConflict!.remote, '555-7777')

    // Vclock merged so future writes advance from the OR of both lineages.
    assert.equal(r.vclock?.['device-other'], 3)
    assert.ok((r.vclock?.['device-test'] ?? 0) >= 1)

    // No legacy "_v2_<ts>.json" sibling file — the conflict lives in-place.
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files    = await ctx.storage.listFiles(folderId)
    assert.equal(files.filter(f => /_v2_\d+\.json$/.test(f.name)).length, 0)

    const warn = ctx.auditEntries.find(e => e.level === 'warn' && e.action === 'sync.conflict')
    assert.ok(warn, 'conflict warn audit entry expected')
  })

  it('push: ETag conflict + local dominates → re-upload wins, no conflict surfaced', async () => {
    // Local already pulled the remote write once, then made an edit on top of
    // it — its vclock dominates the remote's. The 412 we hit is just a stale
    // etag race; the merge should re-upload and succeed.
    const { id, etag } = await uploadRemote(
      { id: 'v1', name: 'Ohio HVAC', phone: '555-1234' },
      { 'device-other': 1 },
    )
    // Local has the old vclock + 1 from this device — so local dominates.
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-9999', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: id, driveEtag: etag,
      vclock: { 'device-other': 1, 'device-test': 1 },
    }))
    // Force etag drift without changing causal history (simulates a rename or
    // metadata bump on Drive's side).
    await ctx.storage.updateFile(id, JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-1234' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00.000Z',
      vclock: { 'device-other': 1 },
    }), 'application/json')

    await pushPending(ctx)
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'synced', 'local-wins re-upload should leave synced state')
    const remote = await ctx.storage.downloadFile(id)
    const parsed = JSON.parse(remote.content) as { data: Record<string, unknown> }
    assert.equal(parsed.data.phone, '555-9999', 'local edit prevailed on Drive')
  })
})

describe('vault/syncEngine — pullFromDrive vclock semantics', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  it('first-time pull: drive wins, vclock seeded from remote', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    await ctx.storage.uploadFile(folderId, 'vendor_v9.json', JSON.stringify({
      id: 'v9', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: { id: 'v9', name: 'Imported', phone: '111' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 4 },
    }), 'application/json')

    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 1)
    assert.equal(r.conflicts, 0)
    const stored = ctx.localIndex.getById('v9')!
    assert.equal((stored.data as { phone: string }).phone, '111')
    assert.equal(stored.vclock?.['device-other'], 4)
  })

  it('drive dominates local → local replaced, vclock merged', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const { id } = await ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'v1', name: 'Ohio HVAC', phone: '555-NEW' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 5, 'device-test': 1 },
    }), 'application/json')
    // Local has the older vclock — drive strictly dominates.
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-old' },
      driveFileId: id, driveEtag: 'old',
      vclock: { 'device-other': 4, 'device-test': 1 },
    }), 'remote')

    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 1)
    assert.equal(r.conflicts, 0)
    const stored = ctx.localIndex.getById('v1')!
    assert.equal((stored.data as { phone: string }).phone, '555-NEW')
    assert.equal(stored.syncState, 'synced')
    assert.equal(stored.vclock?.['device-other'], 5)
  })

  it('local dominates drive → local kept, queued for upload', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const { id } = await ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'v1', name: 'Ohio HVAC', phone: '555-stale' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 1 },
    }), 'application/json')
    // Local strictly dominates: knows about device-other:1 and has its own write.
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-fresh' },
      driveFileId: id, driveEtag: 'old-etag',
      vclock: { 'device-other': 1, 'device-test': 2 },
    }), 'remote')

    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 0, 'local-wins does not increment pulled count')
    assert.equal(r.conflicts, 0)
    const stored = ctx.localIndex.getById('v1')!
    assert.equal((stored.data as { phone: string }).phone, '555-fresh', 'local content preserved')
    assert.equal(stored.syncState, 'pending_upload', 'queued for re-push so drive catches up')
  })

  it('concurrent edit on the same field → conflict state + conflictFields', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const { id } = await ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-remote', notes: 'remote-notes' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 3 },
    }), 'application/json')
    // Local edited the same record concurrently — vclocks neither dominate.
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-local', notes: 'local-notes' },
      driveFileId: id, driveEtag: 'old',
      vclock: { 'device-test': 2 },
    }), 'remote')

    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 0)
    assert.equal(r.conflicts, 1)
    const stored = ctx.localIndex.getById('v1')!
    assert.equal(stored.syncState, 'conflict')
    assert.ok(stored.conflictFields, 'conflictFields populated')
    assert.equal(stored.conflictFields!.length, 2, 'phone + notes conflict')
    const phoneConflict = stored.conflictFields!.find(f => f.path === 'phone')
    assert.equal(phoneConflict!.local,  '555-local')
    assert.equal(phoneConflict!.remote, '555-remote')
    // Local data preserved (so the user doesn't lose in-flight typing).
    assert.equal((stored.data as { phone: string }).phone, '555-local')
    // Vclock is the OR — both lineages are now visible.
    assert.equal(stored.vclock?.['device-other'], 3)
    assert.equal(stored.vclock?.['device-test'],  2)
  })

  it('etag short-circuit: identical etag → no re-download', async () => {
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const upload = await ctx.storage.uploadFile(folderId, 'vendor_v1.json', JSON.stringify({
      id: 'v1', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'v1', name: 'Ohio HVAC' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 1 },
    }), 'application/json')
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC' },
      driveFileId: upload.id, driveEtag: upload.etag,
      vclock: { 'device-other': 1 },
    }), 'remote')

    const r = await pullFromDrive(ctx, 'prop-1')
    assert.equal(r.pulled, 0)
    assert.equal(r.conflicts, 0)
  })
})

describe('vault/syncEngine — mergeRemoteRecord (single-record path)', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  it('preserves a local conflict-resolution: drive=stale + local=resolved (vclock dominates) → local-wins', async () => {
    // Reproduces the bug where pullSingleRecord (delta poll, detail-screen
    // mount) blindly overwrote local — including in-flight conflict resolutions
    // — whenever the etag had moved on Drive.
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-RESOLVED', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: 'drive-1', driveEtag: 'v2',
      // Local has resolved a previous conflict — vclock includes peer's
      // contribution AND a fresh local bump, so local DOMINATES drive.
      vclock: { 'device-other': 1, 'device-test': 2 },
      syncState: 'pending_upload',
    }), 'remote')  // pre-existing state

    const remote = {
      id: 'v1', type: 'vendor', propertyId: 'prop-1', title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-OLD' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 1 },
    } as Parameters<typeof mergeRemoteRecord>[4]

    const result = mergeRemoteRecord(ctx, 'prop-1', 'drive-1', 'v2', remote, ctx.localIndex.getById('v1'))
    assert.equal(result, 'noop', 'local-wins reports noop to caller')

    const r = ctx.localIndex.getById('v1')!
    assert.equal((r.data as { phone: string }).phone, '555-RESOLVED', 'local edit preserved')
    assert.equal(r.syncState, 'pending_upload', 'requeued for push to overwrite drive')
  })

  it('detects concurrent edits via the single-record path too', async () => {
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-LOCAL', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: 'drive-1', driveEtag: 'v1',
      vclock: { 'device-test': 1 },
      syncState: 'synced',
    }), 'remote')

    const remote = {
      id: 'v1', type: 'vendor', propertyId: 'prop-1', title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-PEER' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00Z',
      vclock: { 'device-other': 1 },  // concurrent with local: neither dominates
    } as Parameters<typeof mergeRemoteRecord>[4]

    const result = mergeRemoteRecord(ctx, 'prop-1', 'drive-1', 'v2', remote, ctx.localIndex.getById('v1'))
    assert.equal(result, 'conflict')
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'conflict')
    assert.equal(r.conflictFields?.length, 1)
    assert.equal(r.conflictFields![0].path, 'phone')
    // Local data preserved during conflict.
    assert.equal((r.data as { phone: string }).phone, '555-LOCAL')
    // Vclock OR'd.
    assert.deepEqual(r.vclock, { 'device-test': 1, 'device-other': 1 })
  })

  it('drive dominates → adopts remote, clears any prior conflictFields', async () => {
    ctx.localIndex.upsert(makeVendorRecord({
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-OLD', filename: 'vendor_v1.json',
              rootFolderId: 'root-1', categoryId: 'vendor' },
      driveFileId: 'drive-1', driveEtag: 'v1',
      vclock: { 'device-test': 1 },
      syncState: 'conflict',
      conflictFields: [{ path: 'phone', local: '555-OLD', remote: '???' }],
    }), 'remote')

    const remote = {
      id: 'v1', type: 'vendor', propertyId: 'prop-1', title: 'Ohio HVAC',
      data: { id: 'v1', name: 'Ohio HVAC', phone: '555-NEW' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T01:00:00Z',
      vclock: { 'device-test': 1, 'device-other': 5 },  // dominates local
    } as Parameters<typeof mergeRemoteRecord>[4]

    const result = mergeRemoteRecord(ctx, 'prop-1', 'drive-1', 'v2', remote, ctx.localIndex.getById('v1'))
    assert.equal(result, 'pulled')
    const r = ctx.localIndex.getById('v1')!
    assert.equal(r.syncState, 'synced')
    assert.equal((r.data as { phone: string }).phone, '555-NEW')
    assert.equal(r.conflictFields, undefined, 'stale conflictFields cleared on adopt')
  })

  it('first-time pull (no local) → drive wins, vclock seeded', () => {
    const remote = {
      id: 'v9', type: 'vendor', propertyId: 'prop-1', title: 'Imported',
      data: { id: 'v9', name: 'Imported' },
      syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 3 },
    } as Parameters<typeof mergeRemoteRecord>[4]

    const result = mergeRemoteRecord(ctx, 'prop-1', 'drive-9', 'v1', remote, null)
    assert.equal(result, 'pulled')
    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.syncState, 'synced')
    assert.equal(r.vclock?.['device-other'], 3)
  })
})

describe('vault/syncEngine — tombstones', () => {
  let ctx: Ctx & { auditEntries: ReturnType<typeof recordingAudit>['entries'] }
  beforeEach(() => { ctx = makeCtx() })

  it('push uploads a fresh tombstone alongside the live records', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'a' }))
    ctx.localIndex.upsert(makeVendorRecord({ id: 'b' }))
    await pushPending(ctx)
    ctx.localIndex.softDelete('a')

    const result = await pushPending(ctx)
    assert.equal(result.uploaded, 1)
    // The tombstone file is on Drive and carries the deletedAt marker.
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files    = await ctx.storage.listFiles(folderId)
    const aFile = files.find(f => f.name === 'vendor_a.json')!
    const data  = await ctx.storage.downloadFile(aFile.id)
    const parsed = JSON.parse(data.content) as { deletedAt?: string; syncState: string }
    assert.ok(parsed.deletedAt, 'remote tombstone carries deletedAt')
    assert.equal(parsed.syncState, 'deleted')
  })

  it('push does not loop on a successfully-uploaded tombstone', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'a' }))
    await pushPending(ctx)
    ctx.localIndex.softDelete('a')
    const r1 = await pushPending(ctx)
    assert.equal(r1.uploaded, 1)
    // Local tombstone is still present; pending list shouldn't keep it.
    assert.equal(ctx.localIndex.getPendingTombstones().length, 0,
      'tombstone is no longer pending after the push')
    const r2 = await pushPending(ctx)
    assert.equal(r2.uploaded, 0, 'second push is a no-op')
  })

  it('pull resurrects a remotely-undeleted record only when remote vclock dominates', async () => {
    // Local has tombstoned 'a' with vclock { device-test: 2 }
    ctx.localIndex.upsert(makeVendorRecord({ id: 'a' }))
    await pushPending(ctx)  // syncs once
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files    = await ctx.storage.listFiles(folderId)
    const driveId  = files[0].id
    ctx.localIndex.softDelete('a')

    // Peer un-deletes by writing a live record with a vclock that dominates
    // local's tombstone clock (device-other:5 > anything local has).
    await ctx.storage.updateFile(driveId, JSON.stringify({
      id: 'a', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'a', name: 'Ohio HVAC' },
      syncState: 'synced', localUpdatedAt: '2026-04-21T00:00:00Z',
      vclock: { 'device-test': 5, 'device-other': 5 },
    }), 'application/json')

    await pullFromDrive(ctx, 'prop-1')
    const r = ctx.localIndex.getById('a')!
    assert.equal(r.syncState, 'synced', 'resurrection succeeded')
    assert.equal(r.deletedAt, undefined, 'tombstone cleared')
  })

  it('pull does NOT resurrect when local tombstone vclock dominates', async () => {
    ctx.localIndex.upsert(makeVendorRecord({ id: 'a' }))
    await pushPending(ctx)
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    const files    = await ctx.storage.listFiles(folderId)
    const driveId  = files[0].id

    // Local edits a few times then deletes — vclock = { device-test: 4 }
    const r0 = ctx.localIndex.getById('a')!
    ctx.localIndex.upsert(r0)
    ctx.localIndex.upsert(ctx.localIndex.getById('a')!)
    ctx.localIndex.softDelete('a')

    // Peer writes a live record but with the OLD vclock — they never saw
    // local's edits or tombstone. Local clock dominates.
    await ctx.storage.updateFile(driveId, JSON.stringify({
      id: 'a', type: 'vendor', propertyId: 'prop-1',
      title: 'Ohio HVAC', data: { id: 'a', name: 'Stale' },
      syncState: 'synced', localUpdatedAt: '2026-04-21T00:00:00Z',
      vclock: { 'device-test': 1 },
    }), 'application/json')

    await pullFromDrive(ctx, 'prop-1')
    const r = ctx.localIndex.getById('a')!
    assert.equal(r.syncState, 'deleted', 'tombstone preserved — no resurrection')
    assert.ok(r.deletedAt)
  })

  it('pull mirrors a remote tombstone into the local state machine', async () => {
    // Drive has a never-seen-locally tombstone; first-time pull adopts it.
    const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
    await ctx.storage.uploadFile(folderId, 'vendor_z.json', JSON.stringify({
      id: 'z', type: 'vendor', propertyId: 'prop-1',
      title: 'Gone', data: { id: 'z', name: 'Gone' },
      syncState: 'deleted',
      deletedAt: '2026-04-19T00:00:00Z',
      localUpdatedAt: '2026-04-19T00:00:00Z',
      vclock: { 'device-other': 1 },
    }), 'application/json')

    const result = await pullFromDrive(ctx, 'prop-1')
    assert.equal(result.pulled, 0, 'tombstones are not counted as live pulls')
    const r = ctx.localIndex.getById('z')!
    assert.equal(r.syncState, 'deleted')
    assert.ok(r.deletedAt)
    // And the record is correctly hidden from list views.
    assert.equal(ctx.localIndex.getAll('vendor', 'prop-1').length, 0)
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
