import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, Image, Loader2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import {
  listAlbums,
  listMediaItems,
  thumbnailUrl,
  type Album,
  type MediaItem,
} from '../../photos/PhotosClient'

interface PhotoBrowserProps {
  open: boolean
  onClose: () => void
  onSelect: (item: MediaItem) => void
}

export function PhotoBrowser({ open, onClose, onSelect }: PhotoBrowserProps) {
  const { getToken } = useAuth()
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [photos, setPhotos] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()

  const loadAlbums = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated — sign in to browse photos')
        return
      }
      const result = await listAlbums(token)
      setAlbums(result.albums)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load albums')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  const loadPhotos = useCallback(async (albumId?: string, pageToken?: string) => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        return
      }
      const result = await listMediaItems(token, albumId, pageToken)
      setPhotos(prev => pageToken ? [...prev, ...result.mediaItems] : result.mediaItems)
      setNextPageToken(result.nextPageToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (open) {
      setSelectedAlbum(null)
      setPhotos([])
      setNextPageToken(undefined)
      void loadAlbums()
    }
  }, [open, loadAlbums])

  function handleAlbumClick(album: Album) {
    setSelectedAlbum(album)
    setPhotos([])
    setNextPageToken(undefined)
    void loadPhotos(album.id)
  }

  function handleBack() {
    setSelectedAlbum(null)
    setPhotos([])
    setNextPageToken(undefined)
  }

  function handlePhotoClick(item: MediaItem) {
    onSelect(item)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          {selectedAlbum ? (
            <button onClick={handleBack} className="text-slate-500 hover:text-slate-700">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Image className="w-5 h-5 text-sky-600" />
          )}
          <h2 className="text-sm font-semibold text-slate-800 flex-1 truncate">
            {selectedAlbum ? selectedAlbum.title : 'Google Photos'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p className="text-sm text-red-500 text-center py-8">{error}</p>
          )}

          {loading && photos.length === 0 && albums.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          )}

          {/* Album list */}
          {!selectedAlbum && !error && albums.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {albums.map(album => (
                <button
                  key={album.id}
                  onClick={() => handleAlbumClick(album)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 hover:ring-2 hover:ring-sky-400 transition-all"
                >
                  <img
                    src={thumbnailUrl(album.coverPhotoBaseUrl, 300, 300)}
                    alt={album.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs font-medium text-white truncate">{album.title}</p>
                    <p className="text-xs text-white/70">{album.mediaItemsCount} items</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!selectedAlbum && !error && !loading && albums.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No albums found</p>
          )}

          {/* Photo grid */}
          {selectedAlbum && photos.length > 0 && (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handlePhotoClick(item)}
                    className="aspect-square rounded-lg overflow-hidden bg-slate-100 hover:ring-2 hover:ring-sky-400 transition-all"
                  >
                    <img
                      src={thumbnailUrl(item.baseUrl)}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
              {nextPageToken && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => void loadPhotos(selectedAlbum.id, nextPageToken)}
                    disabled={loading}
                    className="text-sm text-sky-600 hover:text-sky-700 font-medium disabled:text-slate-400"
                  >
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}

          {selectedAlbum && !error && !loading && photos.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No photos in this album</p>
          )}
        </div>
      </div>
    </div>
  )
}
