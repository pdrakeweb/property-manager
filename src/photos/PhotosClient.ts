/**
 * Google Photos Library API client — browser-side, read-only access.
 * Uses the same Bearer token pattern as DriveClient.ts.
 */

const PHOTOS_BASE = 'https://photoslibrary.googleapis.com/v1'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Album {
  id: string
  title: string
  productUrl: string
  mediaItemsCount: string
  coverPhotoBaseUrl: string
  coverPhotoMediaItemId: string
}

export interface MediaItem {
  id: string
  description?: string
  productUrl: string
  baseUrl: string
  mimeType: string
  filename: string
  mediaMetadata: {
    creationTime: string
    width: string
    height: string
    photo?: {
      cameraMake?: string
      cameraModel?: string
    }
  }
}

interface ListAlbumsResponse {
  albums?: Album[]
  nextPageToken?: string
}

interface SearchMediaItemsResponse {
  mediaItems?: MediaItem[]
  nextPageToken?: string
}

// ─── Error class ───────────────────────────────────────────────────────────────

export class PhotosError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'PhotosError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

// ─── API functions ─────────────────────────────────────────────────────────────

/** List the user's albums. */
export async function listAlbums(
  token: string,
  pageToken?: string,
): Promise<{ albums: Album[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: '50' })
  if (pageToken) params.set('pageToken', pageToken)

  const response = await fetch(`${PHOTOS_BASE}/albums?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new PhotosError(`listAlbums failed (${response.status}): ${errText}`, response.status)
  }

  const data: ListAlbumsResponse = await response.json()
  return { albums: data.albums ?? [], nextPageToken: data.nextPageToken }
}

/**
 * Search for media items. Optionally filter by album.
 * Without albumId, returns all photos in the library.
 */
export async function listMediaItems(
  token: string,
  albumId?: string,
  pageToken?: string,
  pageSize = 50,
): Promise<{ mediaItems: MediaItem[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = { pageSize }
  if (albumId) body.albumId = albumId
  if (pageToken) body.pageToken = pageToken

  const response = await fetch(`${PHOTOS_BASE}/mediaItems:search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new PhotosError(`listMediaItems failed (${response.status}): ${errText}`, response.status)
  }

  const data: SearchMediaItemsResponse = await response.json()
  return { mediaItems: data.mediaItems ?? [], nextPageToken: data.nextPageToken }
}

/** Get a single media item by ID. */
export async function getMediaItem(
  token: string,
  mediaItemId: string,
): Promise<MediaItem> {
  const response = await fetch(`${PHOTOS_BASE}/mediaItems/${mediaItemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new PhotosError(`getMediaItem failed (${response.status}): ${errText}`, response.status)
  }

  return response.json()
}

// ─── URL helpers ───────────────────────────────────────────────────────────────

/** Append size parameters to a Photos API baseUrl for thumbnails. */
export function thumbnailUrl(baseUrl: string, width = 256, height = 256): string {
  return `${baseUrl}=w${width}-h${height}-c`
}

/** Full-resolution download URL from a Photos API baseUrl. */
export function fullSizeUrl(baseUrl: string): string {
  return `${baseUrl}=d`
}
