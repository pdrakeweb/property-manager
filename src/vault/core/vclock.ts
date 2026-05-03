/**
 * Vector clock primitives for the CRDT merge model (planning/CRDT-PLAN.md).
 *
 * A `VClock` is a `Record<deviceId, counter>` that tracks how many local
 * writes each device has performed against a record. Comparing two clocks
 * tells us whether one strictly happened-before the other (linear history
 * — straightforward last-writer-wins) or whether they're concurrent
 * (overlapping edits — true conflict needing field-level merge).
 *
 * Pure module: no DOM, no localStorage, no Zod. Safe to import from both
 * the browser bundle and Node test runners.
 */

export type VClock = Record<string, number>

/**
 * `dominates(a, b)` is true when `a` knows about every write `b` knows
 * about, plus at least one more — i.e. `a` strictly happened-after `b`.
 *
 * - all `a[d] >= b[d]`, AND
 * - some `a[d] > b[d]`
 *
 * If both `dominates(a, b)` and `dominates(b, a)` are false, the two
 * clocks are *concurrent* — neither happened-before the other and the
 * caller must invoke a merge function (field-level resolution).
 */
export function dominates(a: VClock | undefined, b: VClock | undefined): boolean {
  const av = a ?? {}
  const bv = b ?? {}
  let strictlyGreaterSomewhere = false
  const devices = new Set([...Object.keys(av), ...Object.keys(bv)])
  for (const d of devices) {
    const aCount = av[d] ?? 0
    const bCount = bv[d] ?? 0
    if (aCount < bCount) return false
    if (aCount > bCount) strictlyGreaterSomewhere = true
  }
  return strictlyGreaterSomewhere
}

/** Equal vclocks (same devices, same counters). */
export function equals(a: VClock | undefined, b: VClock | undefined): boolean {
  const av = a ?? {}
  const bv = b ?? {}
  const devices = new Set([...Object.keys(av), ...Object.keys(bv)])
  for (const d of devices) {
    if ((av[d] ?? 0) !== (bv[d] ?? 0)) return false
  }
  return true
}

/**
 * Concurrent ↔ neither dominates and they're not equal. This is the case
 * that requires a field-level merge / user resolution.
 */
export function concurrent(a: VClock | undefined, b: VClock | undefined): boolean {
  if (equals(a, b)) return false
  return !dominates(a, b) && !dominates(b, a)
}

/** Per-device max merge — combines the causal knowledge of two clocks. */
export function merge(a: VClock | undefined, b: VClock | undefined): VClock {
  const av = a ?? {}
  const bv = b ?? {}
  const out: VClock = {}
  const devices = new Set([...Object.keys(av), ...Object.keys(bv)])
  for (const d of devices) {
    out[d] = Math.max(av[d] ?? 0, bv[d] ?? 0)
  }
  return out
}

/**
 * Increment `deviceId`'s counter by one. Used on every local write so the
 * clock advances monotonically per actor. Returns a new clock; does not
 * mutate the input.
 */
export function increment(clock: VClock | undefined, deviceId: string): VClock {
  const base = clock ?? {}
  return { ...base, [deviceId]: (base[deviceId] ?? 0) + 1 }
}

/**
 * Backward-compat normalisation. Records written before CRDT support
 * (`vclock` undefined) are treated as `{ [deviceId]: 0 }` — a clock that
 * any first-time write will dominate. Per requirement #6 in the task spec.
 */
export function ensureVClock(clock: VClock | undefined, deviceId: string): VClock {
  if (clock && Object.keys(clock).length > 0) return clock
  return { [deviceId]: 0 }
}
