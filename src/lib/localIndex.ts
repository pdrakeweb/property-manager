/**
 * Thin façade over the extracted vault's local index.
 *
 * Before Phase C this module owned the localStorage-backed record index
 * directly. The implementation now lives in `@/vault/core/localIndex.ts`
 * behind the vault singleton, which swaps in different storage adapters
 * (Drive vs dev-bypass memory) based on the current auth state.
 *
 * Cross-tab reactivity via `syncBus` is preserved: every vault-level
 * index change fans out through `getVault().localIndex.subscribe`, which
 * the vault singleton wires into `syncBus.emit` at boot. The façade also
 * emits directly for host-originated writes so callers that didn't go
 * through the vault (rare) still notify the bus.
 */

import { getVault } from './vaultSingleton'
import { syncBus } from './syncBus'
import type { IndexRecord as VaultIndexRecord, SyncState as VaultSyncState, SyncStats as VaultSyncStats } from '../vault'

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
  | 'capital_item'
  | 'capital_transaction'
  | 'capital_override'
  | 'insurance'
  | 'permit'
  | 'road'
  | 'generator_log'

export type SyncState = VaultSyncState
export type SyncStats = VaultSyncStats

export interface IndexRecord extends Omit<VaultIndexRecord, 'type'> {
  type: IndexRecordType
}

export const localIndex = {

  getAll(type: IndexRecordType, propertyId: string): IndexRecord[] {
    return getVault().localIndex.getAll(type, propertyId) as IndexRecord[]
  },

  getById(id: string): IndexRecord | null {
    return getVault().localIndex.getById(id) as IndexRecord | null
  },

  upsert(
    record: Omit<IndexRecord, 'localUpdatedAt'> & { localUpdatedAt?: string },
    source: 'local' | 'remote' = 'local',
  ): void {
    getVault().localIndex.upsert(
      record as unknown as Omit<VaultIndexRecord, 'localUpdatedAt'> & { localUpdatedAt?: string },
      source,
    )
    // Also emit directly — vaultSingleton subscribes on first getVault() so
    // this is technically double-firing inside the vault subscription chain,
    // but syncBus is idempotent for subscribers (cross-tab rebroadcast is
    // guarded by tabId) and this path guarantees the event fires even before
    // the vault subscription has finished initialising.
    syncBus.emit({ type: 'index-updated', recordIds: [record.id], source })
  },

  markSynced(id: string, driveFileId: string, driveUpdatedAt: string, driveEtag?: string): void {
    getVault().localIndex.markSynced(id, driveFileId, driveUpdatedAt, driveEtag)
  },

  markCalendarSynced(id: string, eventIds: string | string[]): void {
    getVault().localIndex.markCalendarSynced(id, eventIds)
  },

  markCalendarError(id: string, error: string): void {
    getVault().localIndex.markCalendarError(id, error)
  },

  getConflicts(): IndexRecord[] {
    return getVault().localIndex.getConflicts() as IndexRecord[]
  },

  markConflict(id: string): void {
    getVault().localIndex.markConflict(id)
  },

  softDelete(id: string): void {
    getVault().localIndex.softDelete(id)
  },

  getPending(): IndexRecord[] {
    return getVault().localIndex.getPending() as IndexRecord[]
  },

  getCount(type: IndexRecordType, propertyId: string): number {
    return getVault().localIndex.getCount(type, propertyId)
  },

  getSyncStats(propertyId?: string): SyncStats {
    return getVault().localIndex.getSyncStats(propertyId)
  },

  hasAny(type: IndexRecordType, propertyId: string): boolean {
    return getVault().localIndex.hasAny(type, propertyId)
  },

  getAllForProperty(propertyId: string): IndexRecord[] {
    return getVault().localIndex.getAllForProperty(propertyId) as IndexRecord[]
  },
}
