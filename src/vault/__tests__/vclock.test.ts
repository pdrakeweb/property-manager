/**
 * Unit tests for vector-clock primitives.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { dominates, equals, concurrent, merge, increment, ensureVClock } from '../core/vclock'

describe('vault/vclock', () => {

  it('dominates: empty clock dominates nothing', () => {
    assert.equal(dominates({}, {}), false)
    assert.equal(dominates({}, undefined), false)
    assert.equal(dominates(undefined, undefined), false)
  })

  it('dominates: a > b on every device → true', () => {
    assert.equal(dominates({ a: 2, b: 1 }, { a: 1, b: 1 }), true)
    assert.equal(dominates({ a: 2 }, { a: 1 }), true)
  })

  it('dominates: a == b on every device → false (no strict greater)', () => {
    assert.equal(dominates({ a: 1, b: 1 }, { a: 1, b: 1 }), false)
  })

  it('dominates: a < b somewhere → false', () => {
    assert.equal(dominates({ a: 2, b: 0 }, { a: 1, b: 1 }), false)
  })

  it('dominates handles missing devices as 0', () => {
    assert.equal(dominates({ a: 1, b: 1 }, { a: 1 }), true)  // a strictly higher on b
    assert.equal(dominates({ a: 1 }, { a: 1, b: 1 }), false) // b higher on a
  })

  it('equals: same devices and counters', () => {
    assert.equal(equals({ a: 2, b: 1 }, { a: 2, b: 1 }), true)
    assert.equal(equals({ a: 1 }, { a: 1, b: 0 }), true)  // missing == 0
    assert.equal(equals({ a: 2 }, { a: 1 }), false)
  })

  it('concurrent: neither dominates and not equal', () => {
    assert.equal(concurrent({ a: 2, b: 1 }, { a: 1, b: 2 }), true)
    assert.equal(concurrent({ a: 1 }, { b: 1 }), true)
  })

  it('concurrent: equal clocks are NOT concurrent', () => {
    assert.equal(concurrent({ a: 1 }, { a: 1 }), false)
  })

  it('concurrent: dominated clocks are NOT concurrent', () => {
    assert.equal(concurrent({ a: 2 }, { a: 1 }), false)
  })

  it('merge: per-device max', () => {
    assert.deepEqual(
      merge({ a: 2, b: 1 }, { a: 1, b: 3, c: 4 }),
      { a: 2, b: 3, c: 4 },
    )
  })

  it('merge: handles undefined inputs', () => {
    assert.deepEqual(merge(undefined, { a: 1 }), { a: 1 })
    assert.deepEqual(merge({ a: 1 }, undefined), { a: 1 })
    assert.deepEqual(merge(undefined, undefined), {})
  })

  it('increment: bumps the named device counter, preserves others', () => {
    assert.deepEqual(increment({ a: 1, b: 2 }, 'a'), { a: 2, b: 2 })
    assert.deepEqual(increment({ a: 1 }, 'b'), { a: 1, b: 1 })
    assert.deepEqual(increment(undefined, 'a'), { a: 1 })
  })

  it('increment is non-mutating', () => {
    const before = { a: 1 }
    const after = increment(before, 'a')
    assert.deepEqual(before, { a: 1 })
    assert.deepEqual(after, { a: 2 })
    assert.notStrictEqual(before, after)
  })

  it('ensureVClock: undefined → { deviceId: 0 } baseline', () => {
    assert.deepEqual(ensureVClock(undefined, 'd1'), { d1: 0 })
    assert.deepEqual(ensureVClock({}, 'd1'), { d1: 0 })
  })

  it('ensureVClock: existing clock returned as-is', () => {
    const existing = { a: 3, b: 1 }
    assert.strictEqual(ensureVClock(existing, 'd1'), existing)
  })

  it('CRDT property: increment then dominates the original', () => {
    const v0 = { a: 1, b: 2 }
    const v1 = increment(v0, 'a')
    assert.equal(dominates(v1, v0), true)
    assert.equal(dominates(v0, v1), false)
  })

  it('CRDT property: merge is commutative', () => {
    const a = { x: 2, y: 1 }
    const b = { y: 3, z: 4 }
    assert.deepEqual(merge(a, b), merge(b, a))
  })

  it('CRDT property: merge is associative', () => {
    const a = { x: 1 }
    const b = { y: 2 }
    const c = { z: 3 }
    assert.deepEqual(merge(merge(a, b), c), merge(a, merge(b, c)))
  })

  it('CRDT property: merge is idempotent', () => {
    const a = { x: 2, y: 1 }
    assert.deepEqual(merge(a, a), a)
  })
})
