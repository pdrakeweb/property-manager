/**
 * localStorage-backed mock of DriveClient.
 * Used in dev bypass mode so the full sync flow runs without OAuth.
 *
 * Storage key: pm_dev_drive_v1 → { files: Record<id, DevEntry> }
 * Folders and files are both DevEntry; folders have isFolder=true.
 */

import type { DriveFile } from './driveClient'
import { CATEGORY_FOLDER_NAMES } from './driveClient'

const STORE_KEY = 'pm_dev_drive_v1'

interface DevEntry {
  id:        string
  name:      string
  parentId:  string
  isFolder:  boolean
  content?:  string
  mimeType?: string
}

function load(): Record<string, DevEntry> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, DevEntry>
  } catch {
    return {}
  }
}

function save(store: Record<string, DevEntry>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

function devId(): string {
  return 'dev_' + Math.random().toString(36).slice(2, 10)
}

/** Find or create a folder with the given name inside parentId. Returns folder id. */
function findOrCreateFolder(name: string, parentId: string): string {
  const store = load()
  const existing = Object.values(store).find(
    e => e.isFolder && e.name === name && e.parentId === parentId,
  )
  if (existing) return existing.id

  const id: string = devId()
  store[id] = { id, name, parentId, isFolder: true }
  save(store)
  return id
}

// ── Adapter (same method signatures as DriveClient) ──────────────────────────

export const localDriveAdapter = {
  /** Mirrors DriveClient.resolveFolderId */
  async resolveFolderId(
    _token: string,
    categoryId: string,
    rootFolderId: string,
  ): Promise<string> {
    const folderName = CATEGORY_FOLDER_NAMES[categoryId] ?? categoryId
    // Ensure root exists
    const root = load()
    if (!root[rootFolderId]) {
      root[rootFolderId] = { id: rootFolderId, name: 'PropertyManager', parentId: '', isFolder: true }
      save(root)
    }
    return findOrCreateFolder(folderName, rootFolderId)
  },

  /** Mirrors DriveClient.listFiles */
  async listFiles(_token: string, folderId: string): Promise<DriveFile[]> {
    const store = load()
    return Object.values(store)
      .filter(e => !e.isFolder && e.parentId === folderId)
      .map(e => ({ id: e.id, name: e.name }))
  },

  /** Mirrors DriveClient.uploadFile */
  async uploadFile(
    _token:   string,
    folderId: string,
    filename: string,
    content:  string | Blob,
    mimeType: string,
  ): Promise<DriveFile> {
    const store = load()

    // Resolve string content (Blob not supported in localStorage; convert if needed)
    let text: string
    if (content instanceof Blob) {
      text = await content.text()
    } else {
      text = content
    }

    // Overwrite if same filename in same folder
    const existing = Object.values(store).find(
      e => !e.isFolder && e.name === filename && e.parentId === folderId,
    )

    if (existing) {
      existing.content  = text
      existing.mimeType = mimeType
      save(store)
      return { id: existing.id, name: existing.name }
    }

    const id = devId()
    store[id] = { id, name: filename, parentId: folderId, isFolder: false, content: text, mimeType }
    save(store)
    return { id, name: filename }
  },
}
