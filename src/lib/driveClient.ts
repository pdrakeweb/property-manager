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
}

export interface DriveFile {
  id:           string
  name:         string
  webViewLink?: string
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

  /** Upload a file using multipart form (metadata + content in one request) */
  async uploadFile(
    token:    string,
    folderId: string,
    filename: string,
    content:  string | Blob,
    mimeType: string,
  ): Promise<DriveFile> {
    const metadata = JSON.stringify({ name: filename, parents: [folderId] })

    const body = content instanceof Blob ? content : new Blob([content], { type: mimeType })

    const form = new FormData()
    form.append('metadata', new Blob([metadata], { type: 'application/json' }))
    form.append('file',     new Blob([body],     { type: mimeType }))

    const resp = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`,
      {
        method:  'POST',
        headers: authHeaders(token),
        body:    form,
      },
    )
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Drive upload failed (${resp.status}): ${text}`)
    }

    return resp.json() as Promise<DriveFile>
  },
}
