/**
 * React bindings for `@/vault`.
 *
 * Kept in a sibling folder (not re-exported from `vault/index.ts`) so the
 * vault core stays runnable in Node for unit tests. Host apps import from
 * `@/vault/react` explicitly.
 *
 * Every hook subscribes to `vault.localIndex.subscribe(...)` so cross-tab
 * pulls, background sync, and direct mutations all trigger re-renders
 * without the host app wiring up its own bus.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndexRecord, RecordVault, SyncStats } from '..'

/**
 * Subscribe to a single record by id. Returns `null` until the record is
 * seen locally. Re-renders on any index change that touches this id.
 */
export function useRecord(vault: RecordVault, id: string | null | undefined): IndexRecord | null {
  const [record, setRecord] = useState<IndexRecord | null>(() =>
    id ? vault.localIndex.getById(id) : null,
  )

  useEffect(() => {
    if (!id) { setRecord(null); return }
    setRecord(vault.localIndex.getById(id))
    const unsub = vault.localIndex.subscribe((ids) => {
      if (ids.includes(id)) setRecord(vault.localIndex.getById(id))
    })
    return unsub
  }, [vault, id])

  return record
}

/**
 * Subscribe to every record of a given type for a property. The array
 * identity is stable across re-renders when the contents haven't changed,
 * so `useRecords(...)` in a memo chain is safe.
 */
export function useRecords(
  vault:      RecordVault,
  type:       string,
  propertyId: string | null | undefined,
): IndexRecord[] {
  const [records, setRecords] = useState<IndexRecord[]>(() =>
    propertyId ? vault.localIndex.getAll(type, propertyId) : [],
  )

  // Remember the last snapshot so we can skip setState when nothing relevant changed.
  const lastSnapshot = useRef<string>('')

  useEffect(() => {
    if (!propertyId) { setRecords([]); lastSnapshot.current = ''; return }

    const refresh = (): void => {
      const next = vault.localIndex.getAll(type, propertyId)
      const key  = next.map(r => `${r.id}:${r.localUpdatedAt}:${r.syncState}`).join('|')
      if (key !== lastSnapshot.current) {
        lastSnapshot.current = key
        setRecords(next)
      }
    }

    refresh()
    const unsub = vault.localIndex.subscribe(refresh)
    return unsub
  }, [vault, type, propertyId])

  return records
}

/**
 * Subscribe to live sync counts for a property (or the whole vault when
 * `propertyId` is omitted). Re-renders whenever any index change occurs —
 * counts are cheap, so we don't bother diffing them.
 */
export function useSyncStatus(
  vault:      RecordVault,
  propertyId?: string,
): SyncStats {
  const [stats, setStats] = useState<SyncStats>(() => vault.syncStats(propertyId))

  useEffect(() => {
    setStats(vault.syncStats(propertyId))
    const unsub = vault.localIndex.subscribe(() => {
      setStats(vault.syncStats(propertyId))
    })
    return unsub
  }, [vault, propertyId])

  return stats
}

/**
 * Subscribe to the vault's conflict list. Handy for a persistent badge or
 * a conflict-resolution screen; re-renders whenever any index change could
 * have added/removed a conflict.
 */
export function useConflicts(vault: RecordVault): IndexRecord[] {
  const [conflicts, setConflicts] = useState<IndexRecord[]>(() => vault.localIndex.getConflicts())

  useEffect(() => {
    setConflicts(vault.localIndex.getConflicts())
    const unsub = vault.localIndex.subscribe(() => {
      setConflicts(vault.localIndex.getConflicts())
    })
    return unsub
  }, [vault])

  return conflicts
}

/**
 * Convenience: memoize a map from record id → record for O(1) lookup.
 * Useful when a screen renders a list and a detail panel against the same
 * data set.
 */
export function useRecordMap(
  vault:      RecordVault,
  type:       string,
  propertyId: string | null | undefined,
): Map<string, IndexRecord> {
  const records = useRecords(vault, type, propertyId)
  return useMemo(() => new Map(records.map(r => [r.id, r])), [records])
}
