/**
 * Runtime-validation path tests (Phase D).
 *
 * Covers the `VaultTypeInfo.validate?()` contract and how the sync engine
 * surfaces validation failures on pull. Intentionally does NOT import Zod
 * — the test registry's `validateVendor` is a plain function so the tests
 * stay focused on the engine's treatment of the validation result rather
 * than on schema semantics.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createLocalIndex, type LocalIndex } from '../core/localIndex'
import { createMemoryAdapter } from '../adapters/memoryAdapter'
import { pullFromDrive } from '../core/syncEngine'
import type { AuditLogger, HostMetadataStore, StorageAdapter, VaultRegistry } from '../core/types'

import { testRegistry, testHost, memoryKV, recordingAudit } from './testFixtures'

interface Ctx {
  storage: StorageAdapter
  localIndex: LocalIndex
  registry: VaultRegistry
  host: HostMetadataStore
  audit: AuditLogger
  auditEntries: ReturnType<typeof recordingAudit>['entries']
}

/**
 * Seed the adapter with a single vendor JSON file at `Vendors/vendor_v9.json`.
 * Returns the file id for assertions that need it.
 */
async function seedRemoteVendor(
  ctx: Ctx,
  data: Record<string, unknown>,
): Promise<string> {
  const folderId = await ctx.storage.resolveFolderId('Vendors', 'root-1')
  const { id } = await ctx.storage.uploadFile(folderId, 'vendor_v9.json', JSON.stringify({
    id: 'v9', type: 'vendor', propertyId: 'prop-1',
    title: 'Imported', data, syncState: 'synced',
    localUpdatedAt: '2026-04-19T00:00:00.000Z',
  }), 'application/json')
  return id
}

function makeCtx(registry: VaultRegistry): Ctx {
  const storage    = createMemoryAdapter()
  const localIndex = createLocalIndex({ kvStore: memoryKV(), now: () => '2026-04-20T00:00:00.000Z' })
  const host       = testHost({ 'prop-1': 'root-1' })
  const { logger, entries } = recordingAudit()
  return { storage, localIndex, registry, host, audit: logger, auditEntries: entries }
}

describe('vault/syncEngine — validation on pull', () => {
  let ctx: Ctx
  beforeEach(() => {
    ctx = makeCtx(testRegistry({
      validateVendor: (d) => {
        if (!d.name || typeof d.name !== 'string') {
          return { ok: false, errors: ['name: required string'] }
        }
        return { ok: true }
      },
    }))
  })

  it('marks invalid remote records as conflict with a reason', async () => {
    await seedRemoteVendor(ctx, { id: 'v9' /* no name */ })
    const result = await pullFromDrive(ctx, 'prop-1')

    assert.equal(result.pulled, 1)
    assert.equal(result.failed, 0)

    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.syncState, 'conflict')
    assert.match(r.conflictReason ?? '', /Invalid data from remote/)
    assert.match(r.conflictReason ?? '', /name: required string/)

    const warn = ctx.auditEntries.find(e => e.level === 'warn' && e.action === 'sync.validation')
    assert.ok(warn, 'sync.validation warn audit entry expected')
  })

  it('lets valid remote records through as synced with no conflictReason', async () => {
    await seedRemoteVendor(ctx, { id: 'v9', name: 'Ohio HVAC' })
    await pullFromDrive(ctx, 'prop-1')

    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.syncState, 'synced')
    assert.equal(r.conflictReason, undefined)
  })

  it('clears a stale conflictReason when the record now validates', async () => {
    // Pre-seed the local index as if a prior pull had marked it conflict.
    ctx.localIndex.upsert({
      id: 'v9', type: 'vendor', propertyId: 'prop-1',
      title: 'Imported', data: {},
      syncState: 'conflict', conflictReason: 'old error',
    })
    await seedRemoteVendor(ctx, { id: 'v9', name: 'Ohio HVAC' })
    await pullFromDrive(ctx, 'prop-1')

    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.syncState, 'synced')
    assert.equal(r.conflictReason, undefined)
  })
})

describe('vault/syncEngine — validation absent', () => {
  it('treats records as valid when the type has no validate()', async () => {
    // Default test registry has no validator on vendor.
    const ctx = makeCtx(testRegistry())
    await seedRemoteVendor(ctx, { id: 'v9' /* garbage */ })
    await pullFromDrive(ctx, 'prop-1')

    const r = ctx.localIndex.getById('v9')!
    assert.equal(r.syncState, 'synced')
    assert.equal(r.conflictReason, undefined)
  })
})
