// Local-first index — single source of truth for all UI reads.
// Drive is the sync target, not the primary read source.

export type IndexRecordType =
  | 'equipment'
  | 'task'
  | 'vendor'
  | 'tax'
  | 'tax_assessment'
  | 'tax_payment'
  | 'mortgage'
  | 'mortgage_payment'
  | 'utility'
  | 'utility_account'
  | 'utility_bill'
  | 'well_test'
  | 'septic_event'
  | 'fuel_delivery'
  | 'completed_event'
  | 'capital_transaction'
  | 'capital_override'
  | 'insurance'
  | 'permit'
  | 'road'
  | 'generator_log'

export type SyncState = 'local_only' | 'pending_upload' | 'synced' | 'conflict'

export interface IndexRecord {
  id: string
  type: IndexRecordType
  categoryId?: string
  propertyId: string
  title: string
  data: Record<string, unknown>
  syncState: SyncState
  driveFileId?: string
  driveEtag?: string          // ETag from last Drive fetch/write
  conflictWithId?: string     // set when this record is a v2 conflict copy
  calendarEventId?:  string    // legacy — single event ID (use calendarEventIds)
  calendarEventIds?: string[]  // one per occurrence (recurring tasks → multiple)
  calendarSyncState?: 'synced' | 'pending' | 'error'
  calendarError?:     string
  localUpdatedAt: string
  driveUpdatedAt?: string
  deletedAt?: string
}

export interface SyncStats {
  total: number
  synced: number
  pending: number
  localOnly: number
  conflicts: number
}

const INDEX_KEY = 'pm_index_v1'

function load(): Record<string, IndexRecord> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Record<string, IndexRecord>
  } catch {
    return {}
  }
}

function save(index: Record<string, IndexRecord>): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export const localIndex = {

  getAll(type: IndexRecordType, propertyId: string): IndexRecord[] {
    const index = load()
    return Object.values(index).filter(
      r => r.type === type && r.propertyId === propertyId && !r.deletedAt,
    )
  },

  getById(id: string): IndexRecord | null {
    return load()[id] ?? null
  },

  /** Insert or replace a record. Always stamps localUpdatedAt. */
  upsert(record: Omit<IndexRecord, 'localUpdatedAt'> & { localUpdatedAt?: string }): void {
    const index = load()
    index[record.id] = { ...record, localUpdatedAt: new Date().toISOString() } as IndexRecord
    save(index)
  },

  markSynced(id: string, driveFileId: string, driveUpdatedAt: string, driveEtag?: string): void {
    const index = load()
    if (!index[id]) return
    index[id] = { ...index[id], syncState: 'synced', driveFileId, driveUpdatedAt, ...(driveEtag ? { driveEtag } : {}) }
    save(index)
  },

  markCalendarSynced(id: string, eventIds: string | string[]): void {
    const index = load()
    if (!index[id]) return
    const ids = Array.isArray(eventIds) ? eventIds : [eventIds]
    index[id] = {
      ...index[id],
      calendarEventIds: ids,
      calendarEventId:  ids[0],   // keep legacy field in sync
      calendarSyncState: 'synced',
      calendarError: undefined,
    }
    save(index)
  },

  markCalendarError(id: string, error: string): void {
    const index = load()
    if (!index[id]) return
    index[id] = { ...index[id], calendarSyncState: 'error', calendarError: error }
    save(index)
  },

  getConflicts(): IndexRecord[] {
    const index = load()
    return Object.values(index).filter(r => r.syncState === 'conflict' && !r.deletedAt)
  },

  markConflict(id: string): void {
    const index = load()
    if (!index[id]) return
    index[id] = { ...index[id], syncState: 'conflict' }
    save(index)
  },

  softDelete(id: string): void {
    const index = load()
    if (!index[id]) return
    index[id] = { ...index[id], deletedAt: new Date().toISOString() }
    save(index)
  },

  /** Records that need to be uploaded to Drive. */
  getPending(): IndexRecord[] {
    const index = load()
    return Object.values(index).filter(r => r.syncState === 'pending_upload' && !r.deletedAt)
  },

  getCount(type: IndexRecordType, propertyId: string): number {
    const index = load()
    return Object.values(index).filter(
      r => r.type === type && r.propertyId === propertyId && !r.deletedAt,
    ).length
  },

  /** Pass propertyId to scope to one property, or omit for global stats. */
  getSyncStats(propertyId?: string): SyncStats {
    const index   = load()
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

  /** True if the index has any records of the given type+property (used to check seed status). */
  hasAny(type: IndexRecordType, propertyId: string): boolean {
    const index = load()
    return Object.values(index).some(r => r.type === type && r.propertyId === propertyId)
  },

  /** All non-deleted records for a property, regardless of type. */
  getAllForProperty(propertyId: string): IndexRecord[] {
    const index = load()
    return Object.values(index).filter(r => r.propertyId === propertyId && !r.deletedAt)
  },
}
