# CRDT / conflict-free data model — plan

**Status:** draft · **Owner:** Pete · **Created:** 2026-04-20

## Problem

The current sync model is optimistic-concurrency with per-record ETags. Two
devices editing the same record within the sync window produce a
`412 Precondition Failed` on upload. The `resolveConflict()` path then either:

- **auto-merges** if no two fields changed on both sides (the "disjoint write"
  case), or
- **writes a v2 file** and marks the local record as `conflict`, requiring
  manual resolution on the `ConflictResolutionScreen`.

This works, but:

1. It operates at **record granularity** — any two field edits to the same
   record force a manual resolve even if they don't actually clash.
2. It's **last-writer-wins within a record** when auto-merge is possible —
   there's no history or provenance per field.
3. Offline edits accumulate on one device and only reconcile on reconnect,
   so a long-offline device can generate many conflicts at once.
4. The "v2 file" branch produces noise in Drive (`_v2_1776700...` filenames)
   that a user has to clean up after resolving.

The goal is a data model where concurrent edits **merge deterministically**
without a manual step, and where the merged result is the same no matter which
order the edits arrive in — a CRDT.

## Target model: per-field Last-Writer-Wins register

A full Automerge-style CRDT is overkill for property-manager data, which is
mostly flat key/value records (one equipment, one task, etc.). Nested arrays
and rich text aren't used. A much simpler **LWW register per field** is
sufficient and composes cleanly with the existing sync path.

### Shape

Today an `IndexRecord.data` looks like:

```ts
{ values: { brand: 'Kohler', model: 'RCA20', ... }, haEntityId: '...', ... }
```

After the migration, each field becomes a versioned register:

```ts
{
  values: {
    brand: { v: 'Kohler', ts: 1776700000000, by: 'deviceA' },
    model: { v: 'RCA20',  ts: 1776700100000, by: 'deviceB' },
  },
  haEntityId: { v: 'switch.generator', ts: 1776700200000, by: 'deviceA' },
  _meta: { schema: 2 }
}
```

**Merge rule:** for each field, keep the register with the higher `ts`; break
ties by `by` (lexicographic). This is commutative, associative, and
idempotent — the three properties that make it a CRDT.

### Device identity

`by` is a stable device ID generated on first launch and stored in
`localStorage` as `pm_device_id`. Not tied to the Google account (same account
can be on multiple devices simultaneously, which is the whole point).

### Tombstones

Field deletion becomes a register write with `v = null` and a fresh `ts`. A
null register with `ts > last-known-value-ts` tombstones the field
permanently; it won't resurrect even if a stale non-null write arrives later.

For whole-record deletion, the existing `deletedAt` on `IndexRecord` already
behaves like a tombstone — keep it, but lift it into the `_meta` block so it
participates in the same LWW comparison.

## Migration

1. **Schema bump**: `_meta.schema = 2`. Old files load as schema 1; reader
   wraps every primitive value in a register with `ts = driveUpdatedAt ??
   localUpdatedAt` and `by = 'legacy'`. Writer always emits schema 2.
2. **Dual-read period** (~1 release): new code reads schema 1 and 2, writes
   only schema 2. This handles the case where one device has updated and the
   other hasn't.
3. **Drop schema 1 reader** once all records on Drive have been rewritten at
   least once (can detect via a one-shot audit pass).

## Changes to sync engine

- `resolveConflict()` becomes a pure merge — no more `v2` files, no more
  manual resolution screen needed for the common case.
- On ETag conflict: download remote, merge field-by-field via LWW, re-upload
  with the new ETag. If that upload also conflicts (rare — someone wrote
  again), loop: re-download, re-merge, retry. Cap at 3 retries before surfacing.
- `pullSingleRecord()` and `pullFromDrive()` already rewrite the local record
  from remote content; after migration they'll naturally do the merge because
  local writes are also in register form, and `upsert()` would need to merge
  into the existing record rather than replacing it. New helper:
  `mergeRecord(local, remote)`.

## UI impact

- `ConflictResolutionScreen` can stay, but only shows the edge cases the CRDT
  can't resolve: semantic conflicts a user must weigh (e.g. both sides edited
  the same field at effectively the same timestamp, or a field the user has
  explicitly flagged as "ask me").
- Per-field timestamps unlock a "last edited on X from device Y" tooltip in
  every form — useful for the multi-device-handoff workflow that's already
  driving this work.
- The dirty-field-preservation logic added to `EquipmentDetailScreen`
  (`dirtyHaRef`) becomes redundant once CRDT merge is in place: a remote
  update to a field the user hasn't touched locally will have an older
  timestamp than the user's local write and so won't overwrite it.

## Non-goals

- **Automerge / Yjs**: full-fat CRDT libraries add ~100KB+ and target rich
  collaborative text. Property manager records are typed flat fields; LWW per
  register is sufficient and keeps the Drive files human-readable.
- **Real-time sync**: still batched via Drive change-token polling. CRDT
  doesn't change the transport, only the merge semantics.
- **Causal history**: we're not storing a graph of operations, just the last
  value per field. This gives up the ability to "undo one user's change" but
  saves a lot of storage and complexity.

## Open questions

- **Clock skew**: LWW relies on comparable timestamps. Devices with wrong
  clocks (e.g. phone with time-zone issues on travel) can produce stale
  writes that "win". Mitigation: on first write after load, compare device
  clock against Drive's `Date` header and emit a warning if skew >5 min.
- **List fields**: a few records use arrays (`calendarEventIds`, service-
  history lists). LWW-on-the-whole-array is lossy — e.g. two devices each
  appending one item to `calendarEventIds` would lose one append. For those
  few fields, use an OR-Set (observed-remove set) instead: each item has its
  own uuid, adds are (uuid,value), removes are a tombstone on uuid.
- **Who "wins" at tie**: stable deterministic fallback (lexicographic
  device ID) is fine for avoiding divergence, but feels arbitrary to the
  user. Consider surfacing tied-timestamp conflicts to the resolution screen
  rather than silently picking a winner.

## Rough sequencing

1. Add per-device ID + emit in `localUpdatedAt` writes (no behavior change
   yet — just instrumentation).
2. Ship the dual-schema reader (schema 1 + 2), still writing schema 1.
3. Flip writer to schema 2. Monitor for a week.
4. Replace `resolveConflict()` with `mergeRecord()`. Keep v2 path as fallback
   for unrecognized-schema data.
5. Drop schema 1 reader after all files have been touched.
6. Add the "last edited by" UI tooltips.
