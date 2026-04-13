import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listMediaItems, type MediaItem } from '../photos/PhotosClient'

const STORAGE_KEY_PREFIX = 'photo_sync_'

/** Stored mapping of property ID to album ID + last sync timestamp. */
interface AlbumMapping {
  albumId: string
  albumTitle: string
  lastSyncTime?: string // ISO timestamp
}

/** Get the album mapping for a property from localStorage. */
function getAlbumMapping(propertyId: string): AlbumMapping | null {
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${propertyId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Save the album mapping for a property to localStorage. */
function setAlbumMapping(propertyId: string, mapping: AlbumMapping): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${propertyId}`, JSON.stringify(mapping))
}

/** Clear the album mapping for a property. */
function clearAlbumMapping(propertyId: string): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${propertyId}`)
}

export function usePhotoSync(propertyId: string) {
  const { getToken } = useAuth()
  const [newPhotos, setNewPhotos] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)

  const mapping = getAlbumMapping(propertyId)

  /** Link a Google Photos album to this property. */
  const linkAlbum = useCallback((albumId: string, albumTitle: string) => {
    setAlbumMapping(propertyId, { albumId, albumTitle })
  }, [propertyId])

  /** Unlink the album from this property. */
  const unlinkAlbum = useCallback(() => {
    clearAlbumMapping(propertyId)
    setNewPhotos([])
  }, [propertyId])

  /** Check for new photos in the linked album since last sync. */
  const checkForNewPhotos = useCallback(async () => {
    const current = getAlbumMapping(propertyId)
    if (!current) return

    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return

      const result = await listMediaItems(token, current.albumId, undefined, 100)
      const items = result.mediaItems

      // Filter to photos added after last sync
      if (current.lastSyncTime) {
        const lastSync = new Date(current.lastSyncTime).getTime()
        const newer = items.filter(item => {
          const created = new Date(item.mediaMetadata.creationTime).getTime()
          return created > lastSync
        })
        setNewPhotos(newer)
      } else {
        // First sync — show all recent photos
        setNewPhotos(items)
      }
    } catch (err) {
      console.error('[usePhotoSync] Failed to check for new photos:', err)
    } finally {
      setLoading(false)
    }
  }, [propertyId, getToken])

  /** Mark sync as complete — updates the last sync timestamp. */
  const markSynced = useCallback(() => {
    const current = getAlbumMapping(propertyId)
    if (!current) return
    setAlbumMapping(propertyId, {
      ...current,
      lastSyncTime: new Date().toISOString(),
    })
    setNewPhotos([])
  }, [propertyId])

  return {
    linkedAlbum: mapping,
    newPhotos,
    loading,
    linkAlbum,
    unlinkAlbum,
    checkForNewPhotos,
    markSynced,
  }
}
