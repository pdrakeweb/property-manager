/**
 * Local-first record index, parameterized on a KV backing store.
 *
 * Lifted almost verbatim from the legacy `src/lib/localIndex.ts` with one
 * key difference: the storage is injected rather than going straight to
 * `localStorage`. That makes the module trivial to unit test in Node.
 */

import type { IndexRecord, KVStore, SyncStats } from './types'
import { ensureVClock, increment as vIncrement } from './vclock'

/**
 * Write-origin tag carried on index-change notifications.
 *
 * Host apps use this to distinguish local edits (which should trigger a
 * push to the remote backend) from pulls (which should just refresh UI).
 */
export type IndexChangeSource = 'local' | 'remote'

export type IndexChangeHandler = (ids: readonly string[], source: IndexChangeSource) => void

export interface LocalIndex {
  getAll(type: string, propertyId: string): IndexRecord[]
  getById(id: string): IndexRecord | null
  /** The optional `source` propagates to subscribers — default is 'local'. */
  upsert(
    record: Omit<IndexRecord, 'localUpdatedAt'> & { localUpdatedAt?: string },
    source?: IndexChangeSource,
  ): void
  markSynced(id: string, driveFileId: string, driveUpdatedAt: string, driveEtag?: string): void
  markCalendarSynced(id: string, eventIds: string | string[]): void
  markCalendarError(id: string, error: string): void
  getConflicts(): IndexRecord[]
  markConflict(id: string): void
  softDelete(id: string): void
  getPending(): IndexRecord[]
  getCount(type: string, propertyId: string): number
  getSyncStats(propertyId?: string): SyncStats
  hasAny(type: string, propertyId: string): boolean
  getAllForProperty(propertyId: string): IndexRecord[]
  /**
   * Subscribe to index-change notifications. Handlers receive the ids of
   * changed records and the write origin so a host app can fan the event
   * out to a cross-tab bus or trigger React re-renders. Returns the
   * unsubscribe function.
   */
  subscribe(handler: IndexChangeHandler): () => void
}

export interface LocalIndexOptions {
  kvStore: KVStore
  /** Storage key; defaults to the historical `pm_index_v1`. */
  indexKey?: string
  /** Time source — tests override to get deterministic timestamps. */
  now?: () => string
  /**
   * Stable id for THIS device — used as the actor on vector-clock writes.
   * Tests override; the browser builds inject the value from
   * `lib/deviceId.ts` via the vault singleton. Defaults to `'unknown-device'`
   * so legacy callers still work, but production callers always pass a real id.
   */
  deviceId?: string
}

/**
 * Factory. Returns a fresh `LocalIndex` bound to the given KV store.
 *
 * All reads go through `load()` and all writes through `save()` so we
 * tolerate concurrent tabs clobbering the localStorage value; the in-memory
 * state is never cached.
 */
export function createLocalIndex(opts: LocalIndexOptions): LocalIndex {
  const {
    kvStore,
    indexKey = 'pm_index_v1',
    now = () => new Date().toISOString(),
    deviceId = 'unknown-device',
  } = opts

  const subscribers = new Set<IndexChangeHandler>()
  function emit(ids: readonly string[], source: IndexChangeSource): void {
    for (const h of subscribers) {
      try { h(ids, source) } catch { /* swallow — subscriber faults must not corrupt the index */ }
    }
  }

  function load(): Record<string, IndexRecord> {
    try {
      return JSON.parse(kvStore.getItem(indexKey) ?? '{}') as Record<string, IndexRecord>
    } catch {
      return {}
    }
  }

  function save(index: Record<string, IndexRecord>): void {
    kvStore.setItem(indexKey, JSON.stringify(index))
  }

  return {
    getAll(type, propertyId) {
      const index = load()
      return Object.values(index).filter(
        r => r.type === type && r.propertyId === propertyId && !r.deletedAt,
      )
    },

    getById(id) {
      return load()[id] ?? null
    },

    upsert(record, source = 'local') {
      const index = load()
      const prior = index[record.id]
      const incoming = { ...record, localUpdatedAt: now() } as IndexRecord

      if (source === 'local') {
        // Local mutation: bump THIS device's counter. Start from the prior
        // record's clock so a new device joining a record's history advances
        // its causal knowledge instead of forking a fresh chain.
        const baseClock = ensureVClock(record.vclock ?? prior?.vclock, deviceId)
        incoming.vclock = vIncrement(baseClock, deviceId)
      } else {
        // Remote-sourced upsert: caller is responsible for setting `vclock`
        // (typically the merged remote+local clock from pullFromDrive).
        // Backfill via ensureVClock when missing for back-compat.
        if (!incoming.vclock) {
          incoming.vclock = ensureVClock(prior?.vclock, deviceId)
        }
      }

      index[record.id] = incoming
      save(index)
      emit([record.id], source)
    },

    markSynced(id, driveFileId, driveUpdatedAt, driveEtag) {
      const index = load()
      if (!index[id]) return
      index[id] = {
        ...index[id],
        syncState: 'synced',
        driveFileId,
        driveUpdatedAt,
        ...(driveEtag ? { driveEtag } : {}),
      }
      save(index)
      emit([id], 'local')
    },

    markCalendarSynced(id, eventIds) {
      const index = load()
      if (!index[id]) return
      const ids = Array.isArray(eventIds) ? eventIds : [eventIds]
      index[id] = {
        ...index[id],
        calendarEventIds: ids,
        calendarEventId: ids[0],
        calendarSyncState: 'synced',
        calendarError: undefined,
      }
      save(index)
    },

    markCalendarError(id, error) {
      const index = load()
      if (!index[id]) return
      index[id] = { ...index[id], calendarSyncState: 'error', calendarError: error }
      save(index)
    },

    getConflicts() {
      const index = load()
      return Object.values(index).filter(r => r.syncState === 'conflict' && !r.deletedAt)
    },

    markConflict(id) {
      const index = load()
      if (!index[id]) return
      index[id] = { ...index[id], syncState: 'conflict' }
      save(index)
    },

    softDelete(id) {
      const index = load()
      if (!index[id]) return
      // Tombstone: bump the clock so this delete dominates any concurrent
      // edit on another device. syncState='deleted' marks it for upload as
      // a tombstone rather than a live record (see pull-side resurrection
      // protection in syncEngine.pullFromDrive).
      const prior = index[index[id].id]
      const baseClock = ensureVClock(prior.vclock, deviceId)
      index[id] = {
        ...index[id],
        deletedAt: now(),
        syncState: 'deleted',
        vclock: vIncrement(baseClock, deviceId),
      }
      save(index)
      emit([id], 'local')
    },

    subscribe(handler) {
      subscribers.add(handler)
      return () => { subscribers.delete(handler) }
    },

    getPending() {
      const index = load()
      return Object.values(index).filter(r => r.syncState === 'pending_upload' && !r.deletedAt)
    },

    getCount(type, propertyId) {
      const index = load()
      return Object.values(index).filter(
        r => r.type === type && r.propertyId === propertyId && !r.deletedAt,
      ).length
    },

    getSyncStats(propertyId) {
      const index = load()
      const records = Object.values(index).filter(
        r => !r.deletedAt && (propertyId == null || r.propertyId === propertyId),
      )
      return {
        total:     records.length,
        synced:    records.filter(r => r.syncState === 'synced').length,
        pending:   records.filter(r => r.syncState === 'pending_upload').length,
        localOnly: records.filter(r => r.syncState === 'local_only').length,
        conflicts: records.filter(r => r.syncState === 'conflict').length,
      }
    },

    hasAny(type, propertyId) {
      const index = load()
      return Object.values(index).some(r => r.type === type && r.propertyId === propertyId)
    },

    getAllForProperty(propertyId) {
      const index = load()
      return Object.values(index).filter(r => r.propertyId === propertyId && !r.deletedAt)
    },
  }
}
