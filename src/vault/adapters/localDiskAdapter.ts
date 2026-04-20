/**
 * Filesystem-backed StorageAdapter — used by functional tests that need to
 * see real files on disk, and as a self-contained mock gdrive harness you
 * can point at a workspace directory and iterate against manually.
 *
 * Runs on Node only (uses `node:fs`). The browser bundle does NOT import
 * this file; it is referenced solely from tests and harness scripts.
 *
 * Directory layout under `rootDir`:
 *
 *   rootDir/
 *     __meta__/
 *       folders.json         — flat map of (folderId → { name, parentId })
 *       files.json           — flat map of (fileId   → { name, parentId, etag })
 *     <folderId>/<filename>  — file contents, one per upload
 *
 * We keep a metadata sidecar so every file has a stable opaque id and an
 * ETag, exactly like Google Drive. Folders are likewise opaque-id'd
 * rather than path-based, which lets the adapter satisfy the same contract
 * as the Drive API (`resolveFolderId(name, parentId) → id`).
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  ETagConflictError,
  type StorageAdapter,
  type StorageFile,
  type StorageFileWithContent,
} from '../core/types'

interface FolderMeta {
  id: string
  name: string
  parentId: string
}

interface FileMeta {
  id: string
  name: string
  parentId: string
  etag: string
  mimeType: string
}

export interface LocalDiskAdapterOptions {
  /** Root directory for the mock drive. Created if it does not exist. */
  rootDir: string
  /**
   * Deterministic id source for tests. Defaults to crypto.randomBytes(8).
   */
  idGen?: () => string
}

function defaultIdGen(): string {
  return 'disk_' + randomBytes(6).toString('hex')
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export interface LocalDiskAdapter extends StorageAdapter {
  /** Absolute path the adapter writes to. Exposed so tests can inspect it. */
  readonly rootDir: string
  /** Wipe the directory. Useful between tests. */
  reset(): void
}

export function createLocalDiskAdapter(options: LocalDiskAdapterOptions): LocalDiskAdapter {
  const rootDir = resolve(options.rootDir)
  const metaDir = join(rootDir, '__meta__')
  const folderFile = join(metaDir, 'folders.json')
  const fileFile   = join(metaDir, 'files.json')
  const idGen      = options.idGen ?? defaultIdGen

  function ensureInit(): void {
    if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true })
    if (!existsSync(folderFile)) writeFileSync(folderFile, '{}')
    if (!existsSync(fileFile)) writeFileSync(fileFile, '{}')
  }

  function loadFolders(): Record<string, FolderMeta> {
    ensureInit()
    try { return JSON.parse(readFileSync(folderFile, 'utf8')) } catch { return {} }
  }
  function saveFolders(m: Record<string, FolderMeta>): void {
    ensureInit()
    writeFileSync(folderFile, JSON.stringify(m, null, 2))
  }
  function loadFiles(): Record<string, FileMeta> {
    ensureInit()
    try { return JSON.parse(readFileSync(fileFile, 'utf8')) } catch { return {} }
  }
  function saveFiles(m: Record<string, FileMeta>): void {
    ensureInit()
    writeFileSync(fileFile, JSON.stringify(m, null, 2))
  }

  function fileBlobPath(fileId: string): string {
    return join(rootDir, fileId + '.bin')
  }

  function findOrCreateFolder(name: string, parentId: string): string {
    const folders = loadFolders()
    const existing = Object.values(folders).find(
      f => f.name === name && f.parentId === parentId,
    )
    if (existing) return existing.id
    const id = idGen()
    folders[id] = { id, name, parentId }
    saveFolders(folders)
    return id
  }

  const adapter: LocalDiskAdapter = {
    get rootDir() { return rootDir },

    reset() {
      if (existsSync(rootDir)) rmSync(rootDir, { recursive: true, force: true })
      ensureInit()
    },

    async ensureFolder(name, parentId) {
      return findOrCreateFolder(name, parentId)
    },

    async resolveFolderId(folderName, rootFolderId) {
      const folders = loadFolders()
      if (!folders[rootFolderId]) {
        folders[rootFolderId] = { id: rootFolderId, name: 'root', parentId: '' }
        saveFolders(folders)
      }
      return findOrCreateFolder(folderName, rootFolderId)
    },

    async listFiles(folderId): Promise<StorageFile[]> {
      const files = loadFiles()
      return Object.values(files)
        .filter(f => f.parentId === folderId)
        .map(f => ({ id: f.id, name: f.name }))
    },

    async downloadFile(fileId): Promise<StorageFileWithContent> {
      const files = loadFiles()
      const meta = files[fileId]
      if (!meta) throw new Error(`localDiskAdapter: file ${fileId} not found`)
      const blobPath = fileBlobPath(fileId)
      const content  = existsSync(blobPath) ? readFileSync(blobPath, 'utf8') : ''
      return { id: meta.id, name: meta.name, content, etag: meta.etag }
    },

    async uploadFile(folderId, filename, content, mimeType, ifMatchEtag): Promise<StorageFile & { etag: string }> {
      const files = loadFiles()
      const text  = typeof content === 'string' ? content : String(content)

      const existing = Object.values(files).find(
        f => f.parentId === folderId && f.name === filename,
      )

      if (existing && ifMatchEtag !== undefined && existing.etag !== ifMatchEtag) {
        const latestContent = existsSync(fileBlobPath(existing.id))
          ? readFileSync(fileBlobPath(existing.id), 'utf8') : ''
        throw new ETagConflictError(existing.id, existing.etag, latestContent)
      }

      if (existing) {
        const newEtag = hashContent(text + '::' + Date.now())
        existing.etag     = newEtag
        existing.mimeType = mimeType
        files[existing.id] = existing
        saveFiles(files)
        writeFileSync(fileBlobPath(existing.id), text)
        return { id: existing.id, name: existing.name, etag: newEtag }
      }

      const id   = idGen()
      const etag = hashContent(text + '::' + Date.now())
      files[id] = { id, name: filename, parentId: folderId, etag, mimeType }
      saveFiles(files)
      writeFileSync(fileBlobPath(id), text)
      return { id, name: filename, etag }
    },

    async updateFile(fileId, content, mimeType) {
      const files = loadFiles()
      const meta = files[fileId]
      if (!meta) throw new Error(`localDiskAdapter: file ${fileId} not found`)
      const text = typeof content === 'string' ? content : String(content)
      meta.etag     = hashContent(text + '::' + Date.now())
      meta.mimeType = mimeType
      files[fileId] = meta
      saveFiles(files)
      writeFileSync(fileBlobPath(fileId), text)
    },

    async searchFiles(query) {
      const nameMatch = query.match(/name='([^']+)'/)
      if (!nameMatch) return []
      const name = nameMatch[1]
      const files = loadFiles()
      return Object.values(files)
        .filter(f => f.name === name)
        .map(f => ({ id: f.id, name: f.name }))
    },

    async searchFolders(term) {
      const folders = loadFolders()
      const lower = term.toLowerCase()
      return Object.values(folders)
        .filter(f => f.name.toLowerCase().includes(lower))
        .map(f => ({ id: f.id, name: f.name }))
        .slice(0, 10)
    },

    async getFolderName(folderId) {
      const folders = loadFolders()
      return folders[folderId]?.name ?? folderId
    },

    async listFolders(parentId) {
      const folders = loadFolders()
      return Object.values(folders)
        .filter(f => f.parentId === parentId)
        .map(f => ({ id: f.id, name: f.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  }

  ensureInit()
  return adapter
}

/** Ad-hoc helper for test teardown. */
export function wipeDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

/** Snapshot every file in the store as `{name, content}`. Handy for assertions. */
export function snapshotDiskAdapter(adapter: LocalDiskAdapter): { name: string; content: string; folderId: string }[] {
  const files = JSON.parse(readFileSync(join(adapter.rootDir, '__meta__', 'files.json'), 'utf8')) as Record<string, FileMeta>
  return Object.values(files).map(f => {
    const blob = join(adapter.rootDir, f.id + '.bin')
    const content = existsSync(blob) ? readFileSync(blob, 'utf8') : ''
    return { name: f.name, content, folderId: f.parentId }
  })
}

// Silence unused-warnings — readdirSync/unlinkSync kept available for future extensions.
void readdirSync
void unlinkSync
