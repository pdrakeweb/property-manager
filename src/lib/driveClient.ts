// Google Drive API v3 wrapper — runs entirely client-side, no backend

const DRIVE_API   = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3'

/** Maps category IDs to human-readable Drive folder names */
export const CATEGORY_FOLDER_NAMES: Record<string, string> = {
  generator:     'Generator',
  hvac:          'HVAC',
  water_heater:  'Water Heater',
  water_treatment: 'Water Treatment',
  well:          'Well System',
  propane:       'Propane',
  septic:        'Septic System',
  electrical:    'Electrical Panel',
  sump_pump:     'Sump Pump',
  radon:         'Radon Mitigation',
  appliance:     'Appliances',
  roof:          'Roof',
  barn:          'Barn',
  surveillance:  'Surveillance',
  forestry_cauv: 'Forestry CAUV',
  service_record: 'Service Records',
  // Domain store folders
  vendor:             'Vendors',
  completed_event:    'Service History',
  capital_transaction:'Capital',
  fuel_delivery:      'Fuel Deliveries',
  tax:                'Tax Records',
  mortgage:           'Mortgage',
  utility:            'Utilities',
  insurance:          'Insurance',
  permit:             'Permits',
  road:               'Road Maintenance',
  generator_log:      'Generator',
  task:               'Maintenance Tasks',
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

/** Search for a folder by name inside a parent; create it if not found */
async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'")
  const q = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const searchUrl = new URL(`${DRIVE_API}/files`)
  searchUrl.searchParams.set('q',         q)
  searchUrl.searchParams.set('fields',    'files(id,name)')
  searchUrl.searchParams.set('pageSize',  '1')

  const searchResp = await fetch(searchUrl.toString(), { headers: authHeaders(token) })
  if (!searchResp.ok) throw new Error(`Drive folder search failed: ${searchResp.status}`)

  const { files } = await searchResp.json() as { files: DriveFile[] }
  if (files && files.length > 0) return files[0].id

  // Create the folder
  const createResp = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [parentId],
    }),
  })
  if (!createResp.ok) throw new Error(`Drive folder creation failed: ${createResp.status}`)

  const folder = await createResp.json() as DriveFile
  return folder.id
}

// ── Public API ───────────────────────────────────────────────────────────────

export const DriveClient = {

  /**
   * Find (or create) the category subfolder inside the property's root Drive folder.
   * Returns the folder ID to use for uploads.
   */
  async resolveFolderId(token: string, categoryId: string, rootFolderId: string): Promise<string> {
    const folderName = CATEGORY_FOLDER_NAMES[categoryId] ?? categoryId
    return findOrCreateFolder(token, folderName, rootFolderId)
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
}
