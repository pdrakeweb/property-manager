/**
 * In-memory StorageAdapter — the reference harness for unit tests.
 *
 * Behaves like Google Drive in every observable way the sync engine cares
 * about: folders live inside folders, files carry monotonic ETags, If-Match
 * uploads raise `ETagConflictError` on mismatch. No disk, no network.
 *
 * The same store can be persisted to a KV (see `kvBackedMemoryAdapter`) to
 * implement the legacy `localDriveAdapter` behavior (dev-bypass mode that
 * survives browser reloads).
 */

import {
  ETagConflictError,
  type KVStore,
  type StorageAdapter,
  type StorageFile,
  type StorageFileWithContent,
} from '../core/types'

interface Entry {
  id: string
  name: string
  parentId: string
  isFolder: boolean
  content?: string
  mimeType?: string
  etag?: string
}

interface BackingStore {
  load(): Record<string, Entry>
  save(state: Record<string, Entry>): void
}

function inMemoryBacking(): BackingStore {
  let state: Record<string, Entry> = {}
  return {
    load: () => state,
    save: (s) => { state = s },
  }
}

function kvBacking(kv: KVStore, key: string): BackingStore {
  return {
    load() {
      try {
        return JSON.parse(kv.getItem(key) ?? '{}') as Record<string, Entry>
      } catch {
        return {}
      }
    },
    save(state) {
      kv.setItem(key, JSON.stringify(state))
    },
  }
}

function randomId(): string {
  return 'mem_' + Math.random().toString(36).slice(2, 10)
}

function nextEtag(current?: string): string {
  if (!current) return 'v1'
  const n = parseInt(current.replace('v', ''), 10)
  return `v${isNaN(n) ? 1 : n + 1}`
}

export interface MemoryAdapterOptions {
  /** Optional KV to persist the adapter's state (browser dev-bypass mode). */
  kvStore?: KVStore
  /** KV key when `kvStore` is set. Defaults to `pm_dev_drive_v1`. */
  storeKey?: string
  /** Custom id generator — tests pass a deterministic sequence. */
  idGen?: () => string
}

function buildAdapter(backing: BackingStore, idGen: () => string): StorageAdapter {

  function findOrCreateFolder(name: string, parentId: string): string {
    const state = backing.load()
    const existing = Object.values(state).find(
      e => e.isFolder && e.name === name && e.parentId === parentId,
    )
    if (existing) return existing.id
    const id = idGen()
    state[id] = { id, name, parentId, isFolder: true }
    backing.save(state)
    return id
  }

  return {
    async ensureFolder(name, parentId) {
      return findOrCreateFolder(name, parentId)
    },

    async resolveFolderId(folderName, rootFolderId) {
      const state = backing.load()
      if (!state[rootFolderId]) {
        state[rootFolderId] = { id: rootFolderId, name: 'root', parentId: '', isFolder: true }
        backing.save(state)
      }
      return findOrCreateFolder(folderName, rootFolderId)
    },

    async searchFiles(query) {
      const nameMatch = query.match(/name='([^']+)'/)
      if (!nameMatch) return []
      const name  = nameMatch[1]
      const state = backing.load()
      return Object.values(state)
        .filter(e => !e.isFolder && e.name === name)
        .map(e => ({ id: e.id, name: e.name }))
    },

    async searchFolders(term) {
      const state = backing.load()
      const lower = term.toLowerCase()
      return Object.values(state)
        .filter(e => e.isFolder && e.name.toLowerCase().includes(lower))
        .map(e => ({ id: e.id, name: e.name }))
        .slice(0, 10)
    },

    async getFolderName(folderId) {
      const state = backing.load()
      return state[folderId]?.name ?? folderId
    },

    async listFolders(parentId) {
      const state = backing.load()
      return Object.values(state)
        .filter(e => e.isFolder && e.parentId === parentId)
        .map(e => ({ id: e.id, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    async updateFile(fileId, content, _mimeType) {
      const state = backing.load()
      const entry = state[fileId]
      if (!entry || entry.isFolder) throw new Error(`memoryAdapter: file ${fileId} not found`)
      entry.content = content
      entry.etag    = nextEtag(entry.etag)
      backing.save(state)
    },

    async listFiles(folderId) {
      const state = backing.load()
      return Object.values(state)
        .filter(e => !e.isFolder && e.parentId === folderId)
        .map(e => ({ id: e.id, name: e.name }))
    },

    async downloadFile(fileId): Promise<StorageFileWithContent> {
      const state = backing.load()
      const entry = state[fileId]
      if (!entry || entry.isFolder) throw new Error(`memoryAdapter: file ${fileId} not found`)
      return {
        id: entry.id,
        name: entry.name,
        content: entry.content ?? '',
        etag: entry.etag ?? 'v1',
      }
    },

    async uploadFile(folderId, filename, content, mimeType, ifMatchEtag): Promise<StorageFile & { etag: string }> {
      const state = backing.load()
      const text = typeof content === 'string' ? content : String(content)

      const existing = Object.values(state).find(
        e => !e.isFolder && e.name === filename && e.parentId === folderId,
      )

      if (existing && ifMatchEtag !== undefined && existing.etag !== ifMatchEtag) {
        throw new ETagConflictError(
          existing.id,
          existing.etag ?? 'v1',
          existing.content ?? '',
        )
      }

      if (existing) {
        const newEtag = nextEtag(existing.etag)
        existing.content  = text
        existing.mimeType = mimeType
        existing.etag     = newEtag
        backing.save(state)
        return { id: existing.id, name: existing.name, etag: newEtag }
      }

      const id    = idGen()
      const etag  = 'v1'
      state[id] = { id, name: filename, parentId: folderId, isFolder: false, content: text, mimeType, etag }
      backing.save(state)
      return { id, name: filename, etag }
    },
  }
}

export function createMemoryAdapter(options: MemoryAdapterOptions = {}): StorageAdapter {
  const { kvStore, storeKey = 'pm_dev_drive_v1', idGen = randomId } = options
  const backing = kvStore ? kvBacking(kvStore, storeKey) : inMemoryBacking()
  return buildAdapter(backing, idGen)
}
