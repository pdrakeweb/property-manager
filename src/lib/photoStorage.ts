/**
 * Photo upload + retrieval helpers.
 *
 * Photos used to be persisted as base-64 data URLs inside CompletedEvent
 * records, which bloats localStorage and never actually syncs to Drive.
 * This module uploads a photo as a binary Drive file, returns a
 * driveFileId, and provides a cached lazy-fetch for display.
 */

const DRIVE_API  = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

// ── data URL helpers ─────────────────────────────────────────────────────────

export interface PhotoBlob {
  blob:     Blob
  mimeType: string
  ext:      string
}

/** Convert a data URL (from FileReader.readAsDataURL) into a Blob. */
export function dataUrlToBlob(dataUrl: string): PhotoBlob | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  const mimeType = match[1]!
  const base64   = match[2]!
  const bin      = atob(base64)
  const bytes    = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = mimeTypeToExt(mimeType)
  return { blob: new Blob([bytes], { type: mimeType }), mimeType, ext }
}

function mimeTypeToExt(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png')  return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  return 'bin'
}

// ── Drive folder resolution ──────────────────────────────────────────────────

const PHOTO_FOLDER_NAME = 'Photos'
const photoFolderCache  = new Map<string, string>()   // rootFolderId → photosFolderId

async function resolvePhotoFolder(token: string, rootFolderId: string): Promise<string> {
  if (!rootFolderId) throw new Error('Property has no Drive root folder configured')
  const cached = photoFolderCache.get(rootFolderId)
  if (cached) return cached

  const escaped = PHOTO_FOLDER_NAME.replace(/'/g, "\\'")
  const q = `name='${escaped}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const searchUrl = new URL(`${DRIVE_API}/files`)
  searchUrl.searchParams.set('q',        q)
  searchUrl.searchParams.set('fields',   'files(id,name)')
  searchUrl.searchParams.set('pageSize', '1')

  const searchResp = await fetch(searchUrl.toString(), { headers: authHeaders(token) })
  if (!searchResp.ok) throw new Error(`Photo folder search failed: ${searchResp.status}`)
  const { files } = await searchResp.json() as { files: Array<{ id: string }> }
  if (files && files.length > 0) {
    photoFolderCache.set(rootFolderId, files[0]!.id)
    return files[0]!.id
  }

  const createResp = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:     PHOTO_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [rootFolderId],
    }),
  })
  if (!createResp.ok) throw new Error(`Photo folder creation failed: ${createResp.status}`)
  const folder = await createResp.json() as { id: string }
  photoFolderCache.set(rootFolderId, folder.id)
  return folder.id
}

// ── Upload ───────────────────────────────────────────────────────────────────

export interface UploadedPhoto {
  driveFileId: string
  mimeType:    string
}

export async function uploadPhotoBlob(
  token:        string,
  rootFolderId: string,
  photoId:      string,
  photo:        PhotoBlob,
): Promise<UploadedPhoto> {
  const folderId = await resolvePhotoFolder(token, rootFolderId)
  const filename = `photo_${photoId}.${photo.ext}`

  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const form = new FormData()
  form.append('metadata', new Blob([metadata],   { type: 'application/json' }))
  form.append('file',     new Blob([photo.blob], { type: photo.mimeType }))

  const resp = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    { method: 'POST', headers: authHeaders(token), body: form },
  )
  if (!resp.ok) throw new Error(`Photo upload failed: ${resp.status}`)
  const file = await resp.json() as { id: string }
  return { driveFileId: file.id, mimeType: photo.mimeType }
}

// ── Display (lazy fetch with cache) ──────────────────────────────────────────

const blobUrlCache = new Map<string, string>()   // driveFileId → object URL

/**
 * Fetch a photo from Drive and return a blob URL. Cached per session.
 * Returns null if the photo can't be fetched (no token, 404, network error).
 */
export async function fetchPhotoBlobUrl(token: string, driveFileId: string): Promise<string | null> {
  const cached = blobUrlCache.get(driveFileId)
  if (cached) return cached
  try {
    const resp = await fetch(
      `${DRIVE_API}/files/${driveFileId}?alt=media`,
      { headers: authHeaders(token) },
    )
    if (!resp.ok) return null
    const blob = await resp.blob()
    const url  = URL.createObjectURL(blob)
    blobUrlCache.set(driveFileId, url)
    return url
  } catch {
    return null
  }
}

export function releasePhotoBlobUrl(driveFileId: string): void {
  const url = blobUrlCache.get(driveFileId)
  if (url) {
    URL.revokeObjectURL(url)
    blobUrlCache.delete(driveFileId)
  }
}
