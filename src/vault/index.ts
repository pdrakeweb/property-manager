/**
 * Public vault API.
 *
 * `createRecordVault` is the single entry point a consuming app uses to wire
 * up an extracted, adapter-based storage plugin. All pieces are swappable:
 *   - `storage`   : any StorageAdapter (google drive, memory, local disk).
 *   - `kvStore`   : any key-value store for the local index (localStorage, Map).
 *   - `registry`  : any VaultRegistry (typically built from a DSL registry).
 *   - `host`      : HostMetadataStore (propertyId → driveRootFolderId).
 *   - `audit`     : optional AuditLogger; defaults to a silent logger.
 */

import { createLocalIndex, type LocalIndex, type IndexChangeHandler, type IndexChangeSource } from './core/localIndex'
import { pushPending, pullFromDrive, syncAll } from './core/syncEngine'
import { exportAllMarkdown, renderRecordMarkdown, resolveMarkdownFilename } from './core/markdownExport'
import {
  nullAuditLogger,
  type AuditLogger,
  type HostMetadataStore,
  type IndexRecord,
  type KVStore,
  type StorageAdapter,
  type SyncResult,
  type SyncState,
  type SyncStats,
  type VaultRegistry,
} from './core/types'

export interface CreateRecordVaultOptions {
  storage:   StorageAdapter
  kvStore:   KVStore
  registry:  VaultRegistry
  host:      HostMetadataStore
  audit?:    AuditLogger
  /** Override the localStorage key for the index. */
  indexKey?: string
  /**
   * Stable id for THIS device, used as the actor on CRDT vector clocks.
   * Browser builds inject the value from `lib/deviceId.ts`; tests pass a
   * fixed string so vclock assertions are deterministic.
   */
  deviceId?: string
}

export interface RecordVault {
  localIndex: LocalIndex
  pushPending(): Promise<{ uploaded: number; failed: number; errors: string[] }>
  pullFromDrive(propertyId: string): Promise<{ pulled: number; failed: number; conflicts: number }>
  syncAll(propertyId: string): Promise<SyncResult>
  exportMarkdown(
    propertyId: string,
    propertyName: string,
    onProgress?: (completed: number, total: number) => void,
  ): ReturnType<typeof exportAllMarkdown>
  /** Render a single record as markdown — exposed for ad-hoc exports/UI. */
  renderMarkdown(record: IndexRecord): string
  /** Resolve a safe .md filename for a record. */
  markdownFilename(record: IndexRecord): string
  /** Shortcut to `localIndex.getSyncStats`. */
  syncStats(propertyId?: string): SyncStats
  /** Sweep tombstones older than `olderThanMs` ago (default 30 days).
   *  Returns the number purged. Safe to call frequently — cheap when no
   *  tombstones are due for collection. */
  gcTombstones(olderThanMs?: number): number
}

export function createRecordVault(opts: CreateRecordVaultOptions): RecordVault {
  const { storage, kvStore, registry, host, audit = nullAuditLogger, indexKey, deviceId } = opts
  const localIndex = createLocalIndex({ kvStore, indexKey, deviceId })
  const ctx = { storage, localIndex, registry, host, audit, deviceId: deviceId ?? 'unknown-device' }

  return {
    localIndex,
    pushPending:   () => pushPending(ctx),
    pullFromDrive: (propertyId) => pullFromDrive(ctx, propertyId),
    syncAll:       (propertyId) => syncAll(ctx, propertyId),
    exportMarkdown: (propertyId, propertyName, onProgress) =>
      exportAllMarkdown(ctx, { propertyId, propertyName }, onProgress),
    renderMarkdown:   (record) => renderRecordMarkdown(registry, record),
    markdownFilename: (record) => resolveMarkdownFilename(registry, record),
    syncStats:        (propertyId) => localIndex.getSyncStats(propertyId),
    gcTombstones:     (olderThanMs) => localIndex.gcTombstones(olderThanMs),
  }
}

// Re-exports for consumers
export type {
  AuditLogger,
  HostMetadataStore,
  IndexChangeHandler,
  IndexChangeSource,
  IndexRecord,
  KVStore,
  LocalIndex,
  StorageAdapter,
  SyncResult,
  SyncState,
  SyncStats,
  VaultRegistry,
}
export { ETagConflictError } from './core/types'
export type { ConflictField } from './core/types'
export { resolveConflictField, resolveAllConflictFields } from './core/mergeRecord'
export { createMemoryAdapter } from './adapters/memoryAdapter'
export { createGoogleDriveAdapter } from './adapters/googleDriveAdapter'
// Node-only adapter is NOT re-exported here — importing it from the
// browser bundle pulls in `node:fs` and friends. Tests and harness scripts
// import it directly from `@/vault/adapters/localDiskAdapter`.
export { buildRegistryFromDSL } from './core/registryAdapter'
export { makeMemoryKVStore } from './core/types'
