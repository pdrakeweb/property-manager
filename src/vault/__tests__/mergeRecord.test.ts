/**
 * Unit tests for the vclock-aware merge logic and the field-level
 * resolver helpers consumed by the ConflictsModal UI.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeRecords,
  resolveConflictField,
  resolveAllConflictFields,
} from '../core/mergeRecord'
import type { IndexRecord } from '../core/types'

const TEST_DEVICE = 'device-test'

function rec(overrides: Partial<IndexRecord>): IndexRecord {
  return {
    id: 'r1',
    type: 'vendor',
    propertyId: 'prop-1',
    title: 'Test',
    data: {},
    syncState: 'synced',
    localUpdatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('vault/mergeRecord — mergeRecords outcomes', () => {

  it('equal vclocks → kind: equal', () => {
    const local  = rec({ vclock: { a: 1 }, data: { x: 'old' } })
    const remote = rec({ vclock: { a: 1 }, data: { x: 'new' } })
    assert.equal(mergeRecords(local, remote, TEST_DEVICE).kind, 'equal')
  })

  it('drive dominates → kind: drive-wins', () => {
    const local  = rec({ vclock: { a: 1 } })
    const remote = rec({ vclock: { a: 2 } })
    assert.equal(mergeRecords(local, remote, TEST_DEVICE).kind, 'drive-wins')
  })

  it('local dominates → kind: local-wins', () => {
    const local  = rec({ vclock: { a: 2 } })
    const remote = rec({ vclock: { a: 1 } })
    assert.equal(mergeRecords(local, remote, TEST_DEVICE).kind, 'local-wins')
  })

  it('concurrent → kind: concurrent + conflictFields populated', () => {
    const local  = rec({ vclock: { a: 1 }, data: { phone: '555-A', notes: 'mine' } })
    const remote = rec({ vclock: { b: 1 }, data: { phone: '555-B', email: 'foo@bar' } })
    const out    = mergeRecords(local, remote, TEST_DEVICE)
    assert.equal(out.kind, 'concurrent')
    if (out.kind !== 'concurrent') return
    assert.equal(out.conflictFields.length, 3, 'phone + notes + email diff')
    const phone = out.conflictFields.find(f => f.path === 'phone')!
    assert.equal(phone.local,  '555-A')
    assert.equal(phone.remote, '555-B')
    assert.deepEqual(out.mergedClock, { a: 1, b: 1 })
  })

  it('concurrent: skips sync-private metadata fields', () => {
    const local  = rec({ vclock: { a: 1 }, data: { name: 'X', filename: 'foo.json', rootFolderId: 'r1' } })
    const remote = rec({ vclock: { b: 1 }, data: { name: 'Y', filename: 'bar.json', rootFolderId: 'r2' } })
    const out    = mergeRecords(local, remote, TEST_DEVICE)
    assert.equal(out.kind, 'concurrent')
    if (out.kind !== 'concurrent') return
    assert.equal(out.conflictFields.length, 1, 'only name surfaces — sync metadata is hidden')
    assert.equal(out.conflictFields[0].path, 'name')
  })

  it('concurrent: identifies the dominant remote device for the "Theirs" hint', () => {
    // Local dominates `b` (3 > 1) but remote dominates `peer` (5 > 0) — so
    // the clocks are concurrent and `peer` is the device that contributed
    // the largest "ahead" gap on the remote side.
    const local  = rec({ vclock: { a: 1, b: 3 }, data: { x: 'mine' } })
    const remote = rec({ vclock: { a: 1, b: 1, peer: 5 }, data: { x: 'theirs' } })
    const out = mergeRecords(local, remote, TEST_DEVICE)
    assert.equal(out.kind, 'concurrent')
    if (out.kind !== 'concurrent') return
    assert.equal(out.conflictFields[0].remoteDeviceId, 'peer')
  })
})

describe('vault/mergeRecord — resolveConflictField', () => {

  function makeConflictRecord(): IndexRecord {
    return rec({
      data: { phone: '555-mine', email: 'mine@x', name: 'shared' },
      syncState: 'conflict',
      conflictReason: 'Concurrent edits on 2 fields',
      conflictFields: [
        { path: 'phone', local: '555-mine', remote: '555-theirs' },
        { path: 'email', local: 'mine@x',   remote: 'theirs@x'   },
      ],
    })
  }

  it('keep mine → field unchanged, remaining conflictFields shrinks', () => {
    const next = resolveConflictField(makeConflictRecord(), 'phone', 'mine')
    assert.equal((next.data as { phone: string }).phone, '555-mine')
    assert.equal(next.conflictFields?.length, 1)
    assert.equal(next.conflictFields![0].path, 'email')
    assert.equal(next.syncState, 'conflict', 'still conflict — email unresolved')
  })

  it('keep theirs → field replaced, remaining conflictFields shrinks', () => {
    const next = resolveConflictField(makeConflictRecord(), 'phone', 'theirs')
    assert.equal((next.data as { phone: string }).phone, '555-theirs')
    assert.equal(next.conflictFields?.length, 1)
    assert.equal(next.syncState, 'conflict')
  })

  it('keep theirs with remote=undefined deletes the field', () => {
    const r = rec({
      data: { name: 'X', oldField: 'value' },
      syncState: 'conflict',
      conflictFields: [{ path: 'oldField', local: 'value', remote: undefined }],
    })
    const next = resolveConflictField(r, 'oldField', 'theirs')
    assert.equal('oldField' in (next.data as Record<string, unknown>), false)
    assert.equal(next.conflictFields, undefined)
  })

  it('last field resolved → state flips to pending_upload, conflictReason cleared', () => {
    let r = makeConflictRecord()
    r = resolveConflictField(r, 'phone', 'mine')
    r = resolveConflictField(r, 'email', 'theirs')
    assert.equal(r.syncState, 'pending_upload', 'queued for re-push')
    assert.equal(r.conflictReason, undefined)
    assert.equal(r.conflictFields, undefined)
    assert.equal((r.data as { email: string }).email, 'theirs@x')
    assert.equal((r.data as { phone: string }).phone, '555-mine')
  })

  it('unknown fieldPath → no-op (already resolved)', () => {
    const r = makeConflictRecord()
    const next = resolveConflictField(r, 'nonexistent', 'mine')
    assert.deepEqual(next, r)
  })
})

describe('vault/mergeRecord — resolveAllConflictFields', () => {

  it('keep all mine → every field unchanged, conflict cleared', () => {
    const r = rec({
      data: { phone: 'mine-p', email: 'mine-e' },
      syncState: 'conflict',
      conflictFields: [
        { path: 'phone', local: 'mine-p', remote: 'theirs-p' },
        { path: 'email', local: 'mine-e', remote: 'theirs-e' },
      ],
    })
    const next = resolveAllConflictFields(r, 'mine')
    assert.equal((next.data as { phone: string }).phone, 'mine-p')
    assert.equal((next.data as { email: string }).email, 'mine-e')
    assert.equal(next.syncState, 'pending_upload')
    assert.equal(next.conflictFields, undefined)
  })

  it('keep all theirs → every field replaced, conflict cleared', () => {
    const r = rec({
      data: { phone: 'mine-p', email: 'mine-e' },
      syncState: 'conflict',
      conflictFields: [
        { path: 'phone', local: 'mine-p', remote: 'theirs-p' },
        { path: 'email', local: 'mine-e', remote: 'theirs-e' },
      ],
    })
    const next = resolveAllConflictFields(r, 'theirs')
    assert.equal((next.data as { phone: string }).phone, 'theirs-p')
    assert.equal((next.data as { email: string }).email, 'theirs-e')
    assert.equal(next.syncState, 'pending_upload')
  })

  it('handles a record with no conflictFields gracefully', () => {
    const r = rec({})
    const next = resolveAllConflictFields(r, 'mine')
    assert.deepEqual(next, r)
  })
})
