/**
 * localStorage-backed mock of DriveClient.
 * Used in dev bypass mode so the full sync flow runs without OAuth.
 *
 * Storage key: pm_dev_drive_v1 → Record<id, DevEntry>
 * Folders and files are both DevEntry; folders have isFolder=true.
 * Each file entry carries an `etag` (simple incrementing version string)
 * so we can simulate 412 Precondition Failed when If-Match doesn't match.
 */

import type { DriveFile, DriveFileWithContent, DriveChangesPage, InboxFile } from './driveClient'
import { CATEGORY_FOLDER_NAMES, ETagConflictError, INBOX_FOLDER_NAME } from './driveClient'

const STORE_KEY = 'pm_dev_drive_v1'

interface DevEntry {
  id:            string
  name:          string
  parentId:      string
  isFolder:      boolean
  content?:      string
  mimeType?:     string
  etag?:         string  // "v1", "v2", … — bumped on each write
  modifiedTime?: string  // ISO 8601 — set on every write
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

function nextEtag(current?: string): string {
  if (!current) return 'v1'
  const n = parseInt(current.replace('v', ''), 10)
  return `v${isNaN(n) ? 1 : n + 1}`
}

/** Find or create a folder with the given name inside parentId. Returns folder id. */
function findOrCreateFolder(name: string, parentId: string): string {
  const store = load()
  const existing = Object.values(store).find(
    e => e.isFolder && e.name === name && e.parentId === parentId,
  )
  if (existing) return existing.id

  const id = devId()
  store[id] = { id, name, parentId, isFolder: true }
  save(store)
  return id
}

// ── Adapter (same method signatures as DriveClient) ──────────────────────────

export const localDriveAdapter = {

  async resolvePropertyManagerFolder(_token: string, rootFolderId: string): Promise<string> {
    return rootFolderId
  },

  async resolveKnowledgebaseFolder(_token: string, rootFolderId: string): Promise<string> {
    return rootFolderId
  },

  async ensureFolder(_token: string, name: string, parentId: string): Promise<string> {
    return findOrCreateFolder(name, parentId)
  },

  /** Mirrors DriveClient.resolveFolderId — category folders directly under root. */
  async resolveFolderId(
    _token:       string,
    categoryId:   string,
    rootFolderId: string,
  ): Promise<string> {
    const folderName = CATEGORY_FOLDER_NAMES[categoryId] ?? categoryId
    const root = load()
    if (!root[rootFolderId]) {
      root[rootFolderId] = { id: rootFolderId, name: 'root', parentId: '', isFolder: true }
      save(root)
    }
    return findOrCreateFolder(folderName, rootFolderId)
  },

  /**
   * Mirrors DriveClient.ensureInboxFolder. Drops a sample `.md` into any
   * brand-new dev inbox so the full pull → parse → review flow is
   * exercisable without a real Drive account. The seed only fires once
   * per dev inbox folder (idempotent on repeat calls).
   */
  async ensureInboxFolder(_token: string, rootFolderId: string): Promise<string> {
    const root = load()
    if (!root[rootFolderId]) {
      root[rootFolderId] = { id: rootFolderId, name: 'root', parentId: '', isFolder: true }
      save(root)
    }
    const folderId = findOrCreateFolder(INBOX_FOLDER_NAME, rootFolderId)

    // Seed: only on the very first creation, when the folder is still empty.
    const store = load()
    const hasAnyFile = Object.values(store).some(e => !e.isFolder && e.parentId === folderId)
    if (!hasAnyFile) {
      const id = devId()
      store[id] = {
        id,
        name:         'sample-conversation.md',
        parentId:     folderId,
        isFolder:     false,
        mimeType:     'text/markdown',
        etag:         'v1',
        modifiedTime: new Date().toISOString(),
        content: [
          '---',
          'property_id: sample',
          'date: 2026-05-03',
          '---',
          '',
          '## Summary',
          '',
          'Walked the property after the spring thaw and noted a few items.',
          '',
          '## Outcomes',
          '',
          '```task',
          'title: Reseal driveway cracks before summer',
          'category: service_record',
          'due: 2026-06-01',
          'estimated_cost: 250',
          'priority: medium',
          'recurrence: annually',
          'confidence: high',
          'raw_text: "Cracks visible at apron — should be sealed before frost-heave damage spreads."',
          '```',
          '',
          '```purchase',
          'title: Replacement HVAC filter — 20x25x4 MERV 11',
          'category: hvac',
          'estimated_cost: 24',
          'vendor: Filtrete',
          'confidence: high',
          '```',
          '',
          '```note',
          'title: Inbox poller smoke test',
          'body: This sample file is dropped automatically by the dev mock so the inbox flow is testable without a real Google Drive. Approve the items above and the entries will land in the local index.',
          'confidence: high',
          '```',
          '',
        ].join('\n'),
      }
      save(store)
    }

    return folderId
  },

  /** Mirrors DriveClient.listInboxFiles — filters by extension + modifiedTime. */
  async listInboxFiles(_token: string, rootFolderId: string, sinceISO?: string): Promise<InboxFile[]> {
    const folderId = await this.ensureInboxFolder(_token, rootFolderId)
    const store = load()
    return Object.values(store)
      .filter(e => !e.isFolder && e.parentId === folderId)
      .filter(e => /\.(md|txt|markdown)$/i.test(e.name))
      .filter(e => !sinceISO || (e.modifiedTime ?? '') > sinceISO)
      .map(e => ({ id: e.id, name: e.name, modifiedTime: e.modifiedTime ?? new Date().toISOString() }))
      .sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime))
  },

  /** Mirrors DriveClient.downloadInboxFile — returns plain text content. */
  async downloadInboxFile(_token: string, fileId: string): Promise<string> {
    const store = load()
    const entry = store[fileId]
    if (!entry || entry.isFolder) throw new Error(`Dev adapter: file ${fileId} not found`)
    return entry.content ?? ''
  },

  /** Mirrors DriveClient.searchFiles — supports name='...' queries */
  async searchFiles(_token: string, query: string): Promise<DriveFile[]> {
    const nameMatch = query.match(/name='([^']+)'/)
    if (!nameMatch) return []
    const name  = nameMatch[1]
    const store = load()
    return Object.values(store)
      .filter(e => !e.isFolder && e.name === name)
      .map(e => ({ id: e.id, name: e.name }))
  },

  async searchFolders(_token: string, term: string): Promise<DriveFile[]> {
    const store = load()
    const lower = term.toLowerCase()
    return Object.values(store)
      .filter(e => e.isFolder && e.name.toLowerCase().includes(lower))
      .map(e => ({ id: e.id, name: e.name }))
      .slice(0, 10)
  },

  async getFolderName(_token: string, folderId: string): Promise<string> {
    const store = load()
    return store[folderId]?.name ?? folderId
  },

  async listFolders(_token: string, parentId: string): Promise<DriveFile[]> {
    const store = load()
    return Object.values(store)
      .filter(e => e.isFolder && e.parentId === parentId)
      .map(e => ({ id: e.id, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  /** Mirrors DriveClient.updateFile */
  async updateFile(
    _token:   string,
    fileId:   string,
    content:  string,
    _mimeType: string,
  ): Promise<void> {
    const store = load()
    const entry = store[fileId]
    if (!entry || entry.isFolder) throw new Error(`Dev adapter: file ${fileId} not found`)
    entry.content      = content
    entry.etag         = nextEtag(entry.etag)
    entry.modifiedTime = new Date().toISOString()
    save(store)
  },

  /** Mirrors DriveClient.listFiles */
  async listFiles(_token: string, folderId: string): Promise<DriveFile[]> {
    const store = load()
    return Object.values(store)
      .filter(e => !e.isFolder && e.parentId === folderId)
      .map(e => ({ id: e.id, name: e.name }))
  },

  /** Mirrors DriveClient.downloadFile — returns content + etag */
  async downloadFile(_token: string, fileId: string): Promise<DriveFileWithContent> {
    const store = load()
    const entry = store[fileId]
    if (!entry || entry.isFolder) throw new Error(`Dev adapter: file ${fileId} not found`)
    return {
      id:      entry.id,
      name:    entry.name,
      content: entry.content ?? '',
      etag:    entry.etag ?? 'v1',
    }
  },

  /**
   * Mirrors DriveClient.uploadFile.
   * If ifMatchEtag is provided and doesn't match the stored etag → throws ETagConflictError,
   * exactly as Drive would return 412.
   */
  async uploadFile(
    _token:       string,
    folderId:     string,
    filename:     string,
    content:      string | Blob,
    mimeType:     string,
    ifMatchEtag?: string,
  ): Promise<DriveFile & { etag: string }> {
    const store = load()

    let text: string
    if (content instanceof Blob) {
      text = await content.text()
    } else {
      text = content
    }

    const existing = Object.values(store).find(
      e => !e.isFolder && e.name === filename && e.parentId === folderId,
    )

    // ── Simulate 412 when ETag doesn't match ────────────────────────────────
    if (existing && ifMatchEtag !== undefined && existing.etag !== ifMatchEtag) {
      throw new ETagConflictError(
        existing.id,
        existing.etag ?? 'v1',
        existing.content ?? '',
      )
    }

    if (existing) {
      const newEtag = nextEtag(existing.etag)
      existing.content      = text
      existing.mimeType     = mimeType
      existing.etag         = newEtag
      existing.modifiedTime = new Date().toISOString()
      save(store)
      return { id: existing.id, name: existing.name, etag: newEtag }
    }

    const id    = devId()
    const etag  = 'v1'
    store[id] = {
      id, name: filename, parentId: folderId, isFolder: false,
      content: text, mimeType, etag, modifiedTime: new Date().toISOString(),
    }
    save(store)
    return { id, name: filename, etag }
  },

  /**
   * Mirrors DriveClient.getStartPageToken. Dev mode has no real `/changes`
   * feed; returning a stable sentinel keeps callers happy and gives them
   * something to persist as their baseline.
   */
  async getStartPageToken(_token: string): Promise<string> {
    return 'dev_changes_token'
  },

  /**
   * Mirrors DriveClient.listChanges. Always returns an empty changes page
   * with the same token echoed back — there is no remote to diverge from
   * in dev mode.
   */
  async listChanges(_token: string, pageToken: string): Promise<DriveChangesPage> {
    return { changes: [], newStartPageToken: pageToken }
  },

  /**
   * Mirrors DriveClient.uploadPhoto. Stores the base64 content of the blob
   * in `pm_dev_drive_v1` under the synthetic id `photo_${recordId}_${filename}`
   * so dev-mode sync can be exercised without OAuth.
   */
  async uploadPhoto(
    propertyId: string,
    recordId:   string,
    photoBlob:  Blob,
    filename:   string,
  ): Promise<string> {
    const reader = new FileReader()
    const base64: string = await new Promise((resolve, reject) => {
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
      reader.readAsDataURL(photoBlob)
    })

    const id    = `photo_${recordId}_${filename}`
    const store = load()
    store[id] = {
      id,
      name:     filename,
      parentId: `prop_${propertyId}`,
      isFolder: false,
      content:  base64,
      mimeType: photoBlob.type || 'image/jpeg',
      etag:     'v1',
    }
    save(store)
    return id
  },
}
