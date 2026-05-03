/**
 * Functional test — drives the sync engine against a real-filesystem
 * adapter so the same contracts are checked end-to-end against something
 * that resembles a live Drive much more closely than an in-process Map.
 *
 * We create a temp directory per test; the snapshot helper inspects on-
 * disk content directly.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createLocalIndex } from '../core/localIndex'
import { createLocalDiskAdapter, snapshotDiskAdapter } from '../adapters/localDiskAdapter'
import { pushPending, pullFromDrive, syncAll } from '../core/syncEngine'
import { testRegistry, testHost, memoryKV, makeVendorRecord, recordingAudit } from './testFixtures'

describe('vault/localDiskAdapter — functional round-trip', () => {
  let rootDir: string
  before(() => { rootDir = mkdtempSync(join(tmpdir(), 'vault-disk-')) })
  after(()  => { rmSync(rootDir, { recursive: true, force: true }) })

  it('pushes records to disk as real .json files', async () => {
    const storage    = createLocalDiskAdapter({ rootDir })
    const localIndex = createLocalIndex({ kvStore: memoryKV() })
    const registry   = testRegistry()
    const host       = testHost({ 'prop-1': 'root-1' })
    const { logger } = recordingAudit()

    localIndex.upsert(makeVendorRecord())

    const result = await pushPending({ storage, localIndex, registry, host, audit: logger, deviceId: 'device-test' })
    assert.equal(result.uploaded, 1)

    const files = snapshotDiskAdapter(storage)
    assert.equal(files.length, 1)
    assert.equal(files[0].name, 'vendor_v1.json')
    const parsed = JSON.parse(files[0].content) as { type: string; data: { name: string } }
    assert.equal(parsed.type, 'vendor')
    assert.equal(parsed.data.name, 'Ohio HVAC')
  })

  it('pulls records written straight to disk as if another device synced', async () => {
    // Fresh directory so there's no cross-test state
    const localRoot = mkdtempSync(join(tmpdir(), 'vault-disk-pull-'))
    try {
      const storage    = createLocalDiskAdapter({ rootDir: localRoot })
      const localIndex = createLocalIndex({ kvStore: memoryKV() })
      const registry   = testRegistry()
      const host       = testHost({ 'prop-1': 'root-1' })
      const { logger } = recordingAudit()

      // Stage a record via the adapter directly
      const folderId = await storage.resolveFolderId('Vendors', 'root-1')
      await storage.uploadFile(folderId, 'vendor_imported.json', JSON.stringify({
        id: 'imp', type: 'vendor', propertyId: 'prop-1',
        title: 'Imported Vendor', data: { id: 'imp', name: 'Imported Vendor' },
        syncState: 'synced', localUpdatedAt: '2026-04-19T00:00:00Z',
      }), 'application/json')

      const result = await pullFromDrive({ storage, localIndex, registry, host, audit: logger, deviceId: 'device-test' }, 'prop-1')
      assert.equal(result.pulled, 1)
      assert.equal(localIndex.getById('imp')?.title, 'Imported Vendor')
    } finally {
      rmSync(localRoot, { recursive: true, force: true })
    }
  })

  it('syncAll round-trips a full cycle (push → pull → push) producing a stable result', async () => {
    const cycleRoot = mkdtempSync(join(tmpdir(), 'vault-disk-cycle-'))
    try {
      const storage    = createLocalDiskAdapter({ rootDir: cycleRoot })
      const localIndex = createLocalIndex({ kvStore: memoryKV() })
      const registry   = testRegistry()
      const host       = testHost({ 'prop-1': 'root-1' })
      const { logger } = recordingAudit()
      const ctx = { storage, localIndex, registry, host, audit: logger, deviceId: 'device-test' }

      localIndex.upsert(makeVendorRecord())
      const first = await syncAll(ctx, 'prop-1')
      assert.equal(first.uploaded, 1)
      assert.equal(first.pulled, 0)

      // Now wipe the local index and make sure the second syncAll restores it
      const localIndex2 = createLocalIndex({ kvStore: memoryKV() })
      const second = await syncAll({ ...ctx, localIndex: localIndex2 }, 'prop-1')
      assert.equal(second.uploaded, 0)
      assert.equal(second.pulled, 1)
      assert.equal(localIndex2.getById('v1')?.title, 'Ohio HVAC')
    } finally {
      rmSync(cycleRoot, { recursive: true, force: true })
    }
  })
})
