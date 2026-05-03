/**
 * Vault core types — the shared vocabulary for the extracted storage plugin.
 *
 * Keep this module free of DOM, localStorage, Google Drive, and Zod imports.
 * Everything here must be runnable in Node for unit tests.
 */

export type SyncState = 'local_only' | 'pending_upload' | 'synced' | 'conflict' | 'deleted'

import type { VClock } from './vclock'

export interface IndexRecord {
  id: string
  type: string
  categoryId?: string
  propertyId: string
  title: string
  data: Record<string, unknown>
  syncState: SyncState
  driveFileId?: string
  driveEtag?: string
  conflictWithId?: string
  /**
   * Human-readable explanation of why a record is in `'conflict'` state.
   * Populated by the vault on schema-validation failures during pull so the
   * conflict UI can show the reason (e.g. "Invalid data: email: bad format").
   * Independent of `conflictWithId`, which links two concurrent-edit siblings.
   */
  conflictReason?: string
  /**
   * Field-level diff captured the last time pull detected a concurrent edit.
   * Each entry has the local and remote values plus the device id that
   * authored the remote write (for the "Keep theirs (deviceX)" hint).
   * Cleared once the user resolves the conflict.
   */
  conflictFields?: ConflictField[]
  calendarEventId?:  string
  calendarEventIds?: string[]
  calendarSyncState?: 'synced' | 'pending' | 'error'
  calendarError?:     string
  localUpdatedAt: string
  driveUpdatedAt?: string
  deletedAt?: string
  /**
   * Vector clock — `Record<deviceId, counter>`. Incremented on every local
   * mutation by the writing device; merged on pull. See `core/vclock.ts`
   * and planning/CRDT-PLAN.md.
   *
   * Optional for back-compat: records written before CRDT support load with
   * `vclock` undefined and are normalised on first read via `ensureVClock`.
   */
  vclock?: VClock
}

/**
 * One field's diff captured for the conflict-resolution UI. The user picks
 * "Keep mine" (use `local`) or "Keep theirs" (use `remote`) per field.
 */
export interface ConflictField {
  /** Dot-path inside `data` (e.g. `'phone'`, `'values.brand'`). */
  path: string
  local: unknown
  remote: unknown
  /** Author of the remote write — last device with `vclock[d] > local`. */
  remoteDeviceId?: string
}

export interface SyncStats {
  total: number
  synced: number
  pending: number
  localOnly: number
  conflicts: number
}

export interface SyncResult {
  uploaded: number
  uploadFailed: number
  uploadErrors: string[]
  pulled: number
  pullFailed: number
}

// ─── Storage adapter (remote backend) ────────────────────────────────────────

export interface StorageFile {
  id: string
  name: string
  webViewLink?: string
}

export interface StorageFileWithContent {
  id: string
  name: string
  content: string
  etag: string
}

/**
 * Thrown by adapters when an If-Match upload is rejected because the remote
 * ETag has moved. The vault's sync engine handles this to drive conflict
 * resolution.
 */
export class ETagConflictError extends Error {
  constructor(
    public readonly fileId:        string,
    public readonly latestEtag:    string,
    public readonly latestContent: string,
  ) {
    super('ETag conflict: file modified by another client')
    this.name = 'ETagConflictError'
  }
}

/**
 * Abstraction over the remote file store.
 *
 * Two concrete implementations ship with the vault:
 *  - `googleDriveAdapter` — talks to Google Drive v3.
 *  - `memoryAdapter` — in-memory only. Used for unit tests and dev bypass.
 *  - `localDiskAdapter` — writes to a local directory (Node). Used for
 *    functional tests that exercise the full sync flow against a real
 *    filesystem rather than an in-process Map.
 *
 * Every method is async to match the Drive contract. Adapters must be
 * concurrency-safe for concurrent reads; write concurrency is the engine's
 * problem via ETag round-trips.
 */
export interface StorageAdapter {
  /**
   * Ensure a named folder exists inside `parentId` and return its id.
   * Idempotent. Multiple concurrent callers for the same (parent,name) must
   * receive the same id (no duplicate folder creation).
   */
  ensureFolder(name: string, parentId: string): Promise<string>

  /**
   * Resolve the folder id for a record type, creating it under `rootFolderId`
   * if it does not yet exist. The folder name is looked up via the registry
   * (variant-aware); adapters do not need to know type→folder mapping.
   */
  resolveFolderId(folderName: string, rootFolderId: string): Promise<string>

  /** List non-trashed files in a folder. */
  listFiles(folderId: string): Promise<StorageFile[]>

  /** Download a file's content and its current ETag. */
  downloadFile(fileId: string): Promise<StorageFileWithContent>

  /**
   * Upload (create or overwrite) a file. If `ifMatchEtag` is provided and
   * does not match the current remote ETag, the adapter MUST throw
   * `ETagConflictError` so the engine can run conflict resolution.
   */
  uploadFile(
    folderId:     string,
    filename:     string,
    content:      string,
    mimeType:     string,
    ifMatchEtag?: string,
  ): Promise<StorageFile & { etag: string }>

  /** Patch a file's contents in place (does not move folders). */
  updateFile(fileId: string, content: string, mimeType: string): Promise<void>

  /** Query by raw search expression. Used for root-level sentinel files. */
  searchFiles(query: string): Promise<StorageFile[]>

  /** List folders matching a name substring. */
  searchFolders(term: string): Promise<StorageFile[]>

  /** Fetch the name of a folder by id. */
  getFolderName(folderId: string): Promise<string>

  /** List all subfolders of a parent. */
  listFolders(parentId: string): Promise<StorageFile[]>
}

// ─── Registry shape consumed by the vault ────────────────────────────────────

/**
 * Per-type info the vault needs to do its job. The host app provides a
 * `VaultRegistry` adapter that maps its own record-definition system onto
 * this shape. Keeping the vault's view structural means the vault does NOT
 * import Zod or the DSL framework directly.
 */
export type VaultValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] }

export interface VaultTypeInfo {
  /** Stable type key (e.g. `'vendor'`). */
  type: string
  /** Default Drive folder name for records of this type. */
  folderName: string
  /** Variant-aware folder name for a specific record's data. */
  resolveFolderName(data: Record<string, unknown>): string
  /** Variant-aware human title for a specific record's data. */
  resolveTitle(data: Record<string, unknown>): string
  /** Render a record as markdown (honors custom `markdown(r)` overrides). */
  renderMarkdown(data: Record<string, unknown>): string
  /** Default .md filename for a record. */
  markdownFilename(data: Record<string, unknown>): string
  /**
   * Validate a record's payload against the registered schema. Implementations
   * typically delegate to `zod.safeParse`. Missing implementation => treat as
   * `{ ok: true }` (no-op) — useful for legacy types not yet on the DSL.
   */
  validate?(data: Record<string, unknown>): VaultValidationResult
}

export interface VaultRegistry {
  /** All registered types — used by pull-from-drive to enumerate folders. */
  allTypes(): string[]
  /** Lookup (or null for unknown types). */
  get(type: string): VaultTypeInfo | null
  /**
   * Non-DSL legacy folder names. Merged with `get(type).folderName` to form
   * the complete list of category folders scanned during pull. Present for
   * app types that are not DSL-registered (e.g. raw equipment categories).
   */
  legacyFolderNames(): Record<string, string>
}

// ─── Host metadata (property info lives outside the vault) ───────────────────

/**
 * The vault is scoped to properties but does not own the property list.
 * The host app implements this tiny interface to bridge `propertyId` →
 * `driveRootFolderId` without leaking the host's property store shape into
 * vault code.
 */
export interface HostMetadataStore {
  getRootFolderId(propertyId: string): string | null
}

// ─── Audit logger hook ───────────────────────────────────────────────────────

export interface AuditLogger {
  info(action: string, message: string, propertyId?: string): void
  warn(action: string, message: string, propertyId?: string): void
  error(action: string, message: string, propertyId?: string): void
}

/** Default no-op logger. */
export const nullAuditLogger: AuditLogger = {
  info() {}, warn() {}, error() {},
}

// ─── KV backing store for the local index ────────────────────────────────────

/**
 * Minimal key-value interface the local index uses. `localStorage` satisfies
 * it in the browser; tests supply an in-memory Map wrapper.
 */
export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Build a KVStore that wraps a plain object — handy for tests. */
export function makeMemoryKVStore(initial: Record<string, string> = {}): KVStore {
  const store: Record<string, string> = { ...initial }
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null },
    setItem(key, value) { store[key] = value },
    removeItem(key) { delete store[key] },
  }
}
