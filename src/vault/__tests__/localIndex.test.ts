/**
 * Unit tests for the parameterized local index.
 *
 * Runs under `node --test` (via tsx) — no DOM, no localStorage, just a
 * Map-backed KVStore. Every behavior the app relies on is verified here
 * so regressions surface independently of the Drive sync engine.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createLocalIndex, type LocalIndex } from '../core/localIndex'
import { memoryKV, makeVendorRecord } from './testFixtures'

const TEST_DEVICE = 'device-A'

function freshIndex(): LocalIndex {
  return createLocalIndex({
    kvStore: memoryKV(),
    now: () => '2026-04-20T00:00:00.000Z',
    deviceId: TEST_DEVICE,
  })
}

describe('vault/localIndex', () => {
  let idx: LocalIndex
  beforeEach(() => { idx = freshIndex() })

  it('starts empty', () => {
    assert.equal(idx.getAll('vendor', 'prop-1').length, 0)
    assert.equal(idx.getPending().length, 0)
    assert.deepEqual(idx.getSyncStats(), { total: 0, synced: 0, pending: 0, localOnly: 0, conflicts: 0 })
  })

  it('upsert + getById round-trip stamps localUpdatedAt', () => {
    idx.upsert(makeVendorRecord())
    const r = idx.getById('v1')
    assert.ok(r)
    assert.equal(r!.localUpdatedAt, '2026-04-20T00:00:00.000Z')
    assert.equal(r!.title, 'Ohio HVAC')
  })

  it('scopes getAll by type AND propertyId', () => {
    idx.upsert(makeVendorRecord({ id: 'v1', propertyId: 'prop-1' }))
    idx.upsert(makeVendorRecord({ id: 'v2', propertyId: 'prop-2' }))
    idx.upsert(makeVendorRecord({ id: 't1', type: 'task' as 'vendor', propertyId: 'prop-1' }))
    assert.equal(idx.getAll('vendor', 'prop-1').length, 1)
    assert.equal(idx.getAll('vendor', 'prop-2').length, 1)
    assert.equal(idx.getAll('task',   'prop-1').length, 1)
  })

  it('hides soft-deleted records from getAll / getAllForProperty', () => {
    idx.upsert(makeVendorRecord())
    idx.softDelete('v1')
    assert.equal(idx.getAll('vendor', 'prop-1').length, 0)
    assert.equal(idx.getAllForProperty('prop-1').length, 0)
    // but still retrievable by id
    assert.ok(idx.getById('v1')?.deletedAt)
  })

  it('markSynced flips state and records Drive metadata', () => {
    idx.upsert(makeVendorRecord())
    idx.markSynced('v1', 'drive-file-id', '2026-04-20T01:00:00Z', 'etag-1')
    const r = idx.getById('v1')!
    assert.equal(r.syncState, 'synced')
    assert.equal(r.driveFileId, 'drive-file-id')
    assert.equal(r.driveEtag, 'etag-1')
  })

  it('getPending returns only pending_upload and skips deleted', () => {
    idx.upsert(makeVendorRecord({ id: 'a' }))
    idx.upsert(makeVendorRecord({ id: 'b', syncState: 'synced' }))
    idx.upsert(makeVendorRecord({ id: 'c' }))
    idx.softDelete('c')
    const pending = idx.getPending()
    assert.equal(pending.length, 1)
    assert.equal(pending[0].id, 'a')
  })

  it('getConflicts only returns conflicts (never deleted)', () => {
    idx.upsert(makeVendorRecord({ id: 'a', syncState: 'conflict' }))
    idx.upsert(makeVendorRecord({ id: 'b' }))
    idx.upsert(makeVendorRecord({ id: 'c', syncState: 'conflict' }))
    idx.softDelete('c')
    const conflicts = idx.getConflicts()
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].id, 'a')
  })

  it('markCalendarSynced stores ids and updates legacy singular field', () => {
    idx.upsert(makeVendorRecord())
    idx.markCalendarSynced('v1', ['ev-1', 'ev-2'])
    const r = idx.getById('v1')!
    assert.deepEqual(r.calendarEventIds, ['ev-1', 'ev-2'])
    assert.equal(r.calendarEventId, 'ev-1')
    assert.equal(r.calendarSyncState, 'synced')
  })

  it('markCalendarError clears prior success state', () => {
    idx.upsert(makeVendorRecord())
    idx.markCalendarError('v1', 'boom')
    const r = idx.getById('v1')!
    assert.equal(r.calendarSyncState, 'error')
    assert.equal(r.calendarError, 'boom')
  })

  it('getSyncStats aggregates across states', () => {
    idx.upsert(makeVendorRecord({ id: '1', syncState: 'synced' }))
    idx.upsert(makeVendorRecord({ id: '2', syncState: 'pending_upload' }))
    idx.upsert(makeVendorRecord({ id: '3', syncState: 'local_only' }))
    idx.upsert(makeVendorRecord({ id: '4', syncState: 'conflict' }))
    idx.upsert(makeVendorRecord({ id: '5', syncState: 'synced' }))
    const stats = idx.getSyncStats()
    assert.deepEqual(stats, { total: 5, synced: 2, pending: 1, localOnly: 1, conflicts: 1 })
  })

  it('getSyncStats scoped by propertyId', () => {
    idx.upsert(makeVendorRecord({ id: '1', propertyId: 'p1', syncState: 'synced' }))
    idx.upsert(makeVendorRecord({ id: '2', propertyId: 'p2', syncState: 'pending_upload' }))
    assert.equal(idx.getSyncStats('p1').total, 1)
    assert.equal(idx.getSyncStats('p2').pending, 1)
  })

  it('hasAny true when records exist (ignoring deleted flag)', () => {
    idx.upsert(makeVendorRecord())
    idx.softDelete('v1')
    // hasAny includes deleted — callers use it only as a "was this property ever seeded?" hint
    assert.equal(idx.hasAny('vendor', 'prop-1'), true)
    assert.equal(idx.hasAny('vendor', 'other'),  false)
  })

  it('survives corrupt JSON in the backing store', () => {
    const kv = memoryKV()
    kv.setItem('pm_index_v1', '{ not json }')
    const idx2 = createLocalIndex({ kvStore: kv })
    assert.equal(idx2.getPending().length, 0)
  })

  it('honors custom indexKey', () => {
    const kv = memoryKV()
    const idx2 = createLocalIndex({ kvStore: kv, indexKey: 'alt_key' })
    idx2.upsert(makeVendorRecord())
    assert.ok(kv.getItem('alt_key'))
    assert.equal(kv.getItem('pm_index_v1'), null)
  })

  // ─── Vector-clock semantics ────────────────────────────────────────────────

  it('local upsert stamps a vclock and increments this device on subsequent writes', () => {
    idx.upsert(makeVendorRecord())
    const r1 = idx.getById('v1')!
    assert.deepEqual(r1.vclock, { [TEST_DEVICE]: 1 })

    idx.upsert(r1)  // re-upsert
    const r2 = idx.getById('v1')!
    assert.deepEqual(r2.vclock, { [TEST_DEVICE]: 2 })

    idx.upsert(r2)
    assert.deepEqual(idx.getById('v1')!.vclock, { [TEST_DEVICE]: 3 })
  })

  it('back-compat: incoming record without vclock is normalised on local upsert', () => {
    const noClock = makeVendorRecord({ vclock: undefined })
    idx.upsert(noClock)
    // Treated as { TEST_DEVICE: 0 } baseline, then incremented to 1.
    assert.deepEqual(idx.getById('v1')!.vclock, { [TEST_DEVICE]: 1 })
  })

  it('remote-sourced upsert does NOT bump the local device counter', () => {
    // Simulates a record landing from pullFromDrive with a clock from another device.
    idx.upsert(
      { ...makeVendorRecord(), vclock: { 'device-other': 4, [TEST_DEVICE]: 2 } },
      'remote',
    )
    // Vclock preserved verbatim — the engine pre-merged before calling upsert.
    assert.deepEqual(idx.getById('v1')!.vclock, { 'device-other': 4, [TEST_DEVICE]: 2 })
  })

  it('local write after a remote pull advances on top of the merged clock', () => {
    idx.upsert(
      { ...makeVendorRecord(), vclock: { 'device-other': 4, [TEST_DEVICE]: 2 } },
      'remote',
    )
    const merged = idx.getById('v1')!
    idx.upsert(merged)  // local edit
    assert.deepEqual(idx.getById('v1')!.vclock, { 'device-other': 4, [TEST_DEVICE]: 3 })
  })

  it('softDelete bumps the vclock so the tombstone dominates', () => {
    idx.upsert(makeVendorRecord())  // vclock = { A: 1 }
    idx.softDelete('v1')             // vclock = { A: 2 }
    const r = idx.getById('v1')!
    assert.deepEqual(r.vclock, { [TEST_DEVICE]: 2 })
    assert.equal(r.syncState, 'deleted')
    assert.ok(r.deletedAt)
  })

  // ─── Tombstones ────────────────────────────────────────────────────────────

  it('getPendingTombstones lists fresh deletes that have not been pushed', () => {
    idx.upsert(makeVendorRecord({ id: 'a' }))
    idx.upsert(makeVendorRecord({ id: 'b' }))
    idx.softDelete('a')
    assert.equal(idx.getPendingTombstones().length, 1)
    assert.equal(idx.getPendingTombstones()[0].id, 'a')
  })

  it('getPendingTombstones excludes tombstones already pushed (driveUpdatedAt >= deletedAt)', () => {
    idx.upsert(makeVendorRecord())
    idx.softDelete('v1')
    // Simulate push: markSynced sets driveUpdatedAt to NOW. Force the
    // tombstone's deletedAt to be older so the comparison works regardless
    // of ms granularity in the test now() stub (which returns a fixed string).
    const before = idx.getById('v1')!
    idx.upsert({ ...before, deletedAt: '2026-04-19T00:00:00.000Z' })
    idx.markSynced('v1', 'drive-id', '2026-04-19T01:00:00.000Z', 'etag')
    assert.equal(idx.getPendingTombstones().length, 0,
      'tombstone with driveUpdatedAt > deletedAt is no longer pending')
  })

  it('markSynced preserves the deleted state on tombstones', () => {
    idx.upsert(makeVendorRecord())
    idx.softDelete('v1')
    idx.markSynced('v1', 'drive-id', '2030-01-01T00:00:00.000Z', 'etag')
    const r = idx.getById('v1')!
    assert.equal(r.syncState, 'deleted', 'tombstone stays deleted, not flipped to synced')
    assert.ok(r.deletedAt)
    assert.equal(r.driveFileId, 'drive-id')
  })

  it('getAllTombstones includes pushed AND unpushed deletes', () => {
    idx.upsert(makeVendorRecord({ id: 'a' }))
    idx.upsert(makeVendorRecord({ id: 'b' }))
    idx.softDelete('a')
    idx.softDelete('b')
    idx.markSynced('a', 'drive-a', '2030-01-01T00:00:00.000Z')
    assert.equal(idx.getAllTombstones().length, 2)
  })

  it('gcTombstones purges tombstones older than the cutoff', () => {
    idx.upsert(makeVendorRecord({ id: 'old' }))
    idx.upsert(makeVendorRecord({ id: 'fresh' }))
    idx.softDelete('old')
    idx.softDelete('fresh')
    // Backdate `old` by 60 days; leave `fresh` at the test now() time.
    const oldRec = idx.getById('old')!
    idx.upsert({ ...oldRec, deletedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString() })

    const purged = idx.gcTombstones()  // default 30 days
    assert.equal(purged, 1)
    assert.equal(idx.getById('old'), null, 'old tombstone hard-deleted')
    assert.ok(idx.getById('fresh'),       'fresh tombstone retained')
  })

  it('gcTombstones honors a custom cutoff', () => {
    idx.upsert(makeVendorRecord({ id: 'a' }))
    idx.softDelete('a')
    const aRec = idx.getById('a')!
    // Two-day-old tombstone
    idx.upsert({ ...aRec, deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString() })

    assert.equal(idx.gcTombstones(7 * 24 * 60 * 60_000), 0, '<7d old: kept')
    assert.equal(idx.gcTombstones(1 * 24 * 60 * 60_000), 1, '>1d old: purged')
  })

  it('gcTombstones leaves live records alone', () => {
    idx.upsert(makeVendorRecord({ id: 'a' }))
    idx.upsert(makeVendorRecord({ id: 'b' }))
    idx.softDelete('a')
    const aRec = idx.getById('a')!
    idx.upsert({ ...aRec, deletedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString() })

    idx.gcTombstones()
    assert.ok(idx.getById('b'), 'live record untouched')
  })
})
