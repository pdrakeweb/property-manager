/**
 * Google Drive API v3 client — browser-side, no backend required.
 * All requests go directly from the browser to the Drive API.
 */

import {
  AUTO_CREATE_FOLDER_NAMES,
  AUTO_CREATE_FOLDERS,
  DRIVE_FOLDER_MAP,
} from './FolderMap'

const DRIVE_BASE = 'https://www.googleapis.com'
const UPLOAD_BASE = `${DRIVE_BASE}/upload/drive/v3/files`
const FILES_BASE = `${DRIVE_BASE}/drive/v3/files`

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string
  name: string
  mimeType?: string
  webViewLink?: string
}

// ─── Core upload ───────────────────────────────────────────────────────────────

/**
 * Multipart upload to Drive. Returns the created file ID.
 * content can be a string (e.g. Markdown) or a Blob (e.g. a JPEG).
 */
export async function uploadFile(
  token: string,
  folderId: string,
  filename: string,
  content: string | Blob,
  mimeType: string,
): Promise<string> {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`

  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
  })

  let body: Blob

  if (typeof content === 'string') {
    const encoder = new TextEncoder()
    const contentBytes = encoder.encode(content)
    const preamble = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      '',
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      '',
    ].join('\r\n')
    const postamble = `\r\n--${boundary}--`

    body = new Blob([
      preamble,
      contentBytes,
      postamble,
    ])
  } else {
    const preamble = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      '',
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      '',
    ].join('\r\n')
    const postamble = `\r\n--${boundary}--`

    body = new Blob([preamble, content, postamble])
  }

  const response = await fetch(
    `${UPLOAD_BASE}?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new DriveError(`Upload failed (${response.status}): ${errText}`, response.status)
  }

  const result: { id: string } = await response.json()
  return result.id
}

// ─── Folder management ─────────────────────────────────────────────────────────

/** Creates a Drive folder and returns its ID. */
export async function createFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  const response = await fetch(`${FILES_BASE}?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new DriveError(`createFolder failed (${response.status}): ${errText}`, response.status)
  }

  const result: { id: string } = await response.json()
  return result.id
}

/**
 * Returns the Drive folder ID for the given key, creating it if necessary.
 * Result is cached in localStorage under `drive_folder_{key}` to avoid
 * redundant API calls on subsequent launches.
 */
export async function ensureFolder(
  token: string,
  key: string,
  name: string,
  parentId: string,
): Promise<string> {
  const cacheKey = `drive_folder_${key}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) return cached

  const id = await createFolder(token, name, parentId)
  localStorage.setItem(cacheKey, id)
  return id
}

// ─── File listing ──────────────────────────────────────────────────────────────

/** Lists files in a folder. Returns id + name for each. */
export async function listFiles(
  token: string,
  folderId: string,
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '200',
    orderBy: 'name',
  })

  const response = await fetch(`${FILES_BASE}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new DriveError(`listFiles failed (${response.status}): ${errText}`, response.status)
  }

  const result: { files: DriveFile[] } = await response.json()
  return result.files ?? []
}

// ─── Folder resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the Drive folder ID for a given category key.
 *
 * - Known folders: looked up directly from DRIVE_FOLDER_MAP
 * - AUTO_CREATE_FOLDERS: created under root on first use, result cached
 * - Appliance routing: kitchen appliances → kitchen folder;
 *   washer/dryer → laundry folder (auto-created)
 *
 * @param categoryKey - e.g. 'generator', 'appliance', 'septic'
 * @param applianceType - only used when categoryKey === 'appliance'
 */
export async function resolveFolderId(
  token: string,
  categoryKey: string,
  applianceType?: string,
): Promise<string> {
  // Special appliance routing
  if (categoryKey === 'appliance') {
    const laundryTypes = ['Washer', 'Dryer']
    if (applianceType && laundryTypes.includes(applianceType)) {
      return ensureFolder(
        token,
        'laundry',
        AUTO_CREATE_FOLDER_NAMES['laundry'],
        DRIVE_FOLDER_MAP.root,
      )
    }
    // Everything else → kitchen folder
    return DRIVE_FOLDER_MAP.kitchen
  }

  // Exact match in DRIVE_FOLDER_MAP
  const mapped = DRIVE_FOLDER_MAP[categoryKey]
  if (mapped) return mapped

  // Auto-create folders
  if (AUTO_CREATE_FOLDERS.includes(categoryKey)) {
    const name = AUTO_CREATE_FOLDER_NAMES[categoryKey] ?? categoryKey
    return ensureFolder(token, categoryKey, name, DRIVE_FOLDER_MAP.root)
  }

  // Fallback to root
  console.warn(`[DriveClient] No folder mapping for key "${categoryKey}", uploading to root`)
  return DRIVE_FOLDER_MAP.root
}

// ─── Error class ───────────────────────────────────────────────────────────────

export class DriveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'DriveError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}
