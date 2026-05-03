/**
 * Vclock-aware three-way merge of two IndexRecords.
 *
 * `mergeRecords(local, remote)` returns one of:
 *  - `{ kind: 'drive-wins'  }` — drive vclock dominates local; caller should
 *    upsert remote verbatim (with merged clock).
 *  - `{ kind: 'local-wins'  }` — local vclock dominates drive; caller should
 *    skip the pull and rely on the next push to overwrite drive.
 *  - `{ kind: 'equal'       }` — same vclock; nothing to do.
 *  - `{ kind: 'concurrent', conflictFields, mergedClock }` — neither
 *    dominates; record is in true conflict. Caller writes the local copy back
 *    with `syncState: 'conflict'`, the merged clock, and `conflictFields` for
 *    the resolution UI.
 *
 * Field-level diff: only top-level keys of `data` are compared. Nested objects
 * (e.g. `values: {...}` on equipment) compare by deep-equality JSON; the user
 * resolves the whole sub-tree at once. This matches the existing
 * `overlappingMutations` granularity and keeps the resolver UI tractable.
 */

import type { IndexRecord, ConflictField } from './types'
import { dominates, equals, merge as mergeClocks, ensureVClock, type VClock } from './vclock'

export type MergeOutcome =
  | { kind: 'drive-wins' }
  | { kind: 'local-wins' }
  | { kind: 'equal' }
  | { kind: 'concurrent'; conflictFields: ConflictField[]; mergedClock: VClock }

export function mergeRecords(
  local:    IndexRecord,
  remote:   IndexRecord,
  deviceId: string,
): MergeOutcome {
  const localClock  = ensureVClock(local.vclock,  deviceId)
  const remoteClock = ensureVClock(remote.vclock, deviceId)

  if (equals(localClock, remoteClock))         return { kind: 'equal' }
  if (dominates(remoteClock, localClock))      return { kind: 'drive-wins' }
  if (dominates(localClock,  remoteClock))     return { kind: 'local-wins' }

  // Concurrent — diff fields and identify the remote author for each clash.
  const remoteAuthor = identifyRemoteAuthor(localClock, remoteClock)
  const conflictFields = diffData(local.data ?? {}, remote.data ?? {}, remoteAuthor)
  const mergedClock = mergeClocks(localClock, remoteClock)
  return { kind: 'concurrent', conflictFields, mergedClock }
}

/** Pick the device that contributed the most-recent remote write, by argmax
 *  of `(remote[d] - local[d])`. Used as a hint in the "Keep theirs" label. */
function identifyRemoteAuthor(localClock: VClock, remoteClock: VClock): string | undefined {
  const devices = new Set([...Object.keys(localClock), ...Object.keys(remoteClock)])
  let best: { device: string; gap: number } | undefined
  for (const d of devices) {
    const gap = (remoteClock[d] ?? 0) - (localClock[d] ?? 0)
    if (gap > 0 && (!best || gap > best.gap)) best = { device: d, gap }
  }
  return best?.device
}

const SYNC_PRIVATE_KEYS = new Set(['filename', 'rootFolderId', 'categoryId'])

function diffData(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  remoteDeviceId: string | undefined,
): ConflictField[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  const fields: ConflictField[] = []
  for (const k of keys) {
    if (SYNC_PRIVATE_KEYS.has(k)) continue  // sync metadata, never user-visible
    const l = local[k]
    const r = remote[k]
    if (JSON.stringify(l) === JSON.stringify(r)) continue
    fields.push({ path: k, local: l, remote: r, remoteDeviceId })
  }
  return fields
}
