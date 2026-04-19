import { useEffect, useState } from 'react'
import { fetchPhotoBlobUrl } from '../lib/photoStorage'
import { getValidToken } from '../auth/oauth'
import type { EventPhoto } from '../schemas'

interface PhotoThumbProps {
  photo:     EventPhoto
  alt:       string
  className?: string
}

/**
 * Renders a photo from either `localDataUrl` (legacy / pre-upload) or
 * `driveFileId` (lazy-fetched via the photoStorage cache). Shows a neutral
 * placeholder while a Drive photo is loading.
 */
export function PhotoThumb({ photo, alt, className }: PhotoThumbProps) {
  const [src, setSrc] = useState<string | null>(photo.localDataUrl ?? null)

  useEffect(() => {
    // Already have a local data URL (legacy or pre-upload) → use it.
    if (photo.localDataUrl) { setSrc(photo.localDataUrl); return }
    if (!photo.driveFileId) { setSrc(null); return }

    let cancelled = false
    getValidToken()
      .then(token => (token ? fetchPhotoBlobUrl(token, photo.driveFileId!) : null))
      .then(url => { if (!cancelled) setSrc(url) })
      .catch(() => { if (!cancelled) setSrc(null) })
    return () => { cancelled = true }
  }, [photo.localDataUrl, photo.driveFileId])

  if (src) return <img src={src} alt={alt} className={className} />
  return (
    <div className={`${className ?? ''} bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs text-slate-400`}>
      photo
    </div>
  )
}
