// Google Drive API v3 wrapper — runs entirely client-side, no backend

const DRIVE_API   = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3'

export const PM_FOLDER_NAME = 'Property Manager'
export const KB_FOLDER_NAME = 'Knowledgebase'

/**
 * Legacy category-ID → Drive folder map.
 *
 * Scoped to **equipment subsystem categories** only (hvac, water_heater, …)
 * — the discriminators carried on `type: 'equipment'` records. DSL-registered
 * record types (vendor, mortgage, insurance, etc.) derive their folder names
 * from `RecordDefinition.folderName` via the vault registry; they used to be
 * duplicated here but were pruned once the registry became authoritative.
 *
 * If you add a new equipment subsystem variant in `records/equipmentProfiles.ts`
 * that ships files under its own folder, add the mapping here too so pull-scan
 * finds the folder.
 */
export const CATEGORY_FOLDER_NAMES: Record<string, string> = {
  generator:       'Generator',
  hvac:            'HVAC',
  water_heater:    'Water Heater',
  water_treatment: 'Water Treatment',
  well:            'Well System',
  propane:         'Propane',
  septic:          'Septic System',
  electrical:      'Electrical Panel',
  sump_pump:       'Sump Pump',
  radon:           'Radon Mitigation',
  appliance:       'Appliances',
  roof:            'Roof',
  barn:            'Barn',
  surveillance:    'Surveillance',
  forestry_cauv:   'Forestry CAUV',
  service_record:  'Service Records',
}

export interface DriveFile {
  id:           string
  name:         string
  webViewLink?: string
}

export interface DriveFileWithContent {
  id:      string
  name:    string
  content: string
  etag:    string
}

export interface DriveChange {
  fileId:  string
  removed: boolean
  file?:   { id: string; name: string; trashed?: boolean; parents?: string[] }
}

export interface DriveChangesPage {
  changes:            DriveChange[]
  newStartPageToken?: string
  nextPageToken?:     string
}

/** Thrown when Drive returns 412 Precondition Failed (ETag mismatch). */
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

// ── Internal helpers ─────────────────────────────────────────────────────────

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

/**
 * Session-level cache of in-flight and completed findOrCreateFolder calls.
 * Key: `${parentId}::${name}`. Stores the Promise so concurrent callers
 * awaiting the same folder share one network round-trip and never race to
 * create duplicates (Drive's list endpoint has eventual consistency, so a
 * freshly created folder may not appear in a search issued milliseconds later).
 */
const folderCache = new Map<string, Promise<string>>()

/** Search for a folder by name inside a parent; create it if not found. */
async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const key = `${parentId}::${name}`
  const cached = folderCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const escaped = name.replace(/'/g, "\\'")
    const q = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`

    const searchUrl = new URL(`${DRIVE_API}/files`)
    searchUrl.searchParams.set('q',        q)
    searchUrl.searchParams.set('fields',   'files(id,name)')
    searchUrl.searchParams.set('pageSize', '1')

    const searchResp = await fetch(searchUrl.toString(), { headers: authHeaders(token) })
    if (!searchResp.ok) throw new Error(`Drive folder search failed: ${searchResp.status}`)

    const { files } = await searchResp.json() as { files: DriveFile[] }
    if (files && files.length > 0) return files[0].id

    const createResp = await fetch(`${DRIVE_API}/files`, {
      method:  'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    })
    if (!createResp.ok) throw new Error(`Drive folder creation failed: ${createResp.status}`)

    const folder = await createResp.json() as DriveFile
    return folder.id
  })()

  // Cache immediately so any concurrent caller awaits the same promise
  folderCache.set(key, promise)
  // On failure, evict so a retry can try again
  promise.catch(() => folderCache.delete(key))
  return promise
}

/** Clear the in-memory folder cache (e.g. after sign-out or token refresh). */
export function clearFolderCache(): void {
  folderCache.clear()
}

// ── Public API ───────────────────────────────────────────────────────────────

export const DriveClient = {

  /** @deprecated No-op — property manager no longer uses a subfolder. Returns root. */
  async resolvePropertyManagerFolder(_token: string, rootFolderId: string): Promise<string> {
    return rootFolderId
  },

  /** Knowledgebase lives directly in the property root (no extra subfolder). */
  async resolveKnowledgebaseFolder(_token: string, rootFolderId: string): Promise<string> {
    return rootFolderId
  },

  /** Generic find-or-create a named folder under any parent. */
  async ensureFolder(token: string, name: string, parentId: string): Promise<string> {
    return findOrCreateFolder(token, name, parentId)
  },

  /**
   * Find (or create) the category subfolder directly under the property root.
   * All data lives at `[root]/[Category]/`.
   */
  async resolveFolderId(token: string, categoryId: string, rootFolderId: string): Promise<string> {
    const folderName = CATEGORY_FOLDER_NAMES[categoryId] ?? categoryId
    return findOrCreateFolder(token, folderName, rootFolderId)
  },

  /**
   * Get a Drive changes page token to use as the baseline for delta polling.
   * Call once, persist the token, then feed it to listChanges() on each poll.
   */
  async getStartPageToken(token: string): Promise<string> {
    const resp = await fetch(`${DRIVE_API}/changes/startPageToken`, { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive getStartPageToken failed: ${resp.status}`)
    const { startPageToken } = await resp.json() as { startPageToken: string }
    return startPageToken
  },

  /**
   * Fetch changes since the given page token. Returns the changed files plus
   * (usually) a newStartPageToken to use on the next poll.
   * If the token is stale/invalid, Drive returns 404 — caller should fall back
   * to a full pull and acquire a fresh startPageToken.
   */
  async listChanges(token: string, pageToken: string): Promise<DriveChangesPage> {
    const url = new URL(`${DRIVE_API}/changes`)
    url.searchParams.set('pageToken',      pageToken)
    url.searchParams.set('pageSize',       '100')
    url.searchParams.set('fields',         'changes(fileId,removed,file(id,name,trashed,parents)),newStartPageToken,nextPageToken')
    url.searchParams.set('includeRemoved', 'true')
    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive listChanges failed: ${resp.status}`)
    return await resp.json() as DriveChangesPage
  },

  /** Search across all app-created files using a Drive query string. */
  async searchFiles(token: string, query: string): Promise<DriveFile[]> {
    const url = new URL(`${DRIVE_API}/files`)
    url.searchParams.set('q',        query)
    url.searchParams.set('fields',   'files(id,name)')
    url.searchParams.set('pageSize', '10')
    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive search failed: ${resp.status}`)
    const { files } = await resp.json() as { files: DriveFile[] }
    return files ?? []
  },

  /** Search for folders whose names contain the given term. */
  async searchFolders(token: string, term: string): Promise<DriveFile[]> {
    const escaped = term.replace(/'/g, "\\'")
    const q = `name contains '${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const url = new URL(`${DRIVE_API}/files`)
    url.searchParams.set('q',       q)
    url.searchParams.set('fields',  'files(id,name)')
    url.searchParams.set('orderBy', 'name')
    url.searchParams.set('pageSize','10')
    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive folder search failed: ${resp.status}`)
    const { files } = await resp.json() as { files: DriveFile[] }
    return files ?? []
  },

  /** Fetch a folder's name given its ID (for display after pasting an ID/URL). */
  async getFolderName(token: string, folderId: string): Promise<string> {
    const resp = await fetch(
      `${DRIVE_API}/files/${folderId}?fields=name`,
      { headers: authHeaders(token) },
    )
    if (!resp.ok) throw new Error(`Drive getFolderName failed: ${resp.status}`)
    const { name } = await resp.json() as { name: string }
    return name
  },

  /** List all folders (not files) directly inside a parent folder. */
  async listFolders(token: string, parentId: string): Promise<DriveFile[]> {
    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const url = new URL(`${DRIVE_API}/files`)
    url.searchParams.set('q',       q)
    url.searchParams.set('fields',  'files(id,name)')
    url.searchParams.set('orderBy', 'name')
    url.searchParams.set('pageSize','50')
    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive listFolders failed: ${resp.status}`)
    const { files } = await resp.json() as { files: DriveFile[] }
    return files ?? []
  },

  /** Update the content of an existing file in-place (no parent change). */
  async updateFile(
    token:    string,
    fileId:   string,
    content:  string,
    mimeType: string,
  ): Promise<void> {
    const resp = await fetch(
      `${UPLOAD_API}/files/${fileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { ...authHeaders(token) as Record<string, string>, 'Content-Type': mimeType },
        body:    content,
      },
    )
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Drive updateFile failed (${resp.status}): ${text}`)
    }
  },

  /** List all non-trashed files in a folder */
  async listFiles(token: string, folderId: string): Promise<DriveFile[]> {
    const url = new URL(`${DRIVE_API}/files`)
    url.searchParams.set('q',        `'${folderId}' in parents and trashed=false`)
    url.searchParams.set('fields',   'files(id,name,webViewLink)')
    url.searchParams.set('pageSize', '100')

    const resp = await fetch(url.toString(), { headers: authHeaders(token) })
    if (!resp.ok) throw new Error(`Drive listFiles failed: ${resp.status}`)

    const { files } = await resp.json() as { files: DriveFile[] }
    return files ?? []
  },

  /**
   * Download a file's content and return it along with the ETag.
   * The ETag is used for optimistic concurrency on subsequent uploads.
   */
  async downloadFile(token: string, fileId: string): Promise<DriveFileWithContent> {
    // Fetch metadata (name) + ETag
    const metaResp = await fetch(
      `${DRIVE_API}/files/${fileId}?fields=id,name`,
      { headers: authHeaders(token) },
    )
    if (!metaResp.ok) throw new Error(`Drive downloadFile metadata failed: ${metaResp.status}`)
    const meta = await metaResp.json() as DriveFile
    const etag = metaResp.headers.get('ETag') ?? metaResp.headers.get('etag') ?? ''

    // Fetch content
    const contentResp = await fetch(
      `${DRIVE_API}/files/${fileId}?alt=media`,
      { headers: authHeaders(token) },
    )
    if (!contentResp.ok) throw new Error(`Drive downloadFile content failed: ${contentResp.status}`)
    const content = await contentResp.text()

    return { id: fileId, name: meta.name, content, etag }
  },

  /**
   * Upload a file using multipart form (metadata + content in one request).
   * If ifMatchEtag is provided, sends If-Match header for optimistic concurrency.
   * Throws ETagConflictError on 412 Precondition Failed.
   */
  async uploadFile(
    token:        string,
    folderId:     string,
    filename:     string,
    content:      string | Blob,
    mimeType:     string,
    ifMatchEtag?: string,
  ): Promise<DriveFile & { etag: string }> {
    const metadata = JSON.stringify({ name: filename, parents: [folderId] })

    const body = content instanceof Blob ? content : new Blob([content], { type: mimeType })

    const form = new FormData()
    form.append('metadata', new Blob([metadata], { type: 'application/json' }))
    form.append('file',     new Blob([body],     { type: mimeType }))

    const headers: HeadersInit = authHeaders(token) as Record<string, string>
    if (ifMatchEtag) {
      (headers as Record<string, string>)['If-Match'] = ifMatchEtag
    }

    const resp = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`,
      { method: 'POST', headers, body: form },
    )

    // 412 = ETag mismatch — another client wrote this file first
    if (resp.status === 412) {
      // Re-fetch the current version to get latest ETag + content
      const currentEtag    = resp.headers.get('ETag') ?? resp.headers.get('etag') ?? ''
      // Attempt to find the file by name in the folder to get its ID
      const listed = await DriveClient.listFiles(token, folderId)
      const existing = listed.find(f => f.name === filename)
      let latestContent = ''
      let latestEtag    = currentEtag
      if (existing) {
        try {
          const dl = await DriveClient.downloadFile(token, existing.id)
          latestContent = dl.content
          latestEtag    = dl.etag || latestEtag
          throw new ETagConflictError(existing.id, latestEtag, latestContent)
        } catch (e) {
          if (e instanceof ETagConflictError) throw e
        }
      }
      throw new ETagConflictError('unknown', latestEtag, latestContent)
    }

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Drive upload failed (${resp.status}): ${text}`)
    }

    const file = await resp.json() as DriveFile
    const etag = resp.headers.get('ETag') ?? resp.headers.get('etag') ?? ''
    return { ...file, etag }
  },

  /**
   * Upload a photo blob to Drive and return the new file ID.
   * Files are stored under `[propertyRoot]/photos/` so they live alongside
   * the JSON service-event records but in their own folder.
   */
  async uploadPhoto(
    propertyId: string,
    recordId:   string,
    photoBlob:  Blob,
    filename:   string,
  ): Promise<string> {
    const token = localStorage.getItem('google_access_token')
    if (!token) throw new Error('uploadPhoto: not authenticated')

    const { propertyStore } = await import('./propertyStore')
    const property = propertyStore.getById(propertyId)
    const rootFolderId = property?.driveRootFolderId
    if (!rootFolderId) throw new Error(`uploadPhoto: no Drive root for property ${propertyId}`)

    const photosFolder = await findOrCreateFolder(token, 'photos', rootFolderId)
    const safeName     = `${recordId}_${filename}`
    const mimeType     = photoBlob.type || 'image/jpeg'

    const result = await DriveClient.uploadFile(token, photosFolder, safeName, photoBlob, mimeType)
    return result.id
  },
}
