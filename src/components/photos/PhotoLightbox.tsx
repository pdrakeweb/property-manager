/**
 * Full-screen photo lightbox.
 *
 * Tapping a thumbnail in the maintenance history grid (or anywhere else
 * that displays photo arrays) opens this overlay. Arrow keys / swipe /
 * pager dots navigate between photos in the same group; Escape closes.
 *
 * The component is intentionally generic — it takes any list of items
 * with `localDataUrl` plus optional `role` and `caption`, so it can be
 * reused beyond completed_event photos.
 */

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface LightboxPhoto {
  id: string
  localDataUrl?: string
  caption?: string
  role?: 'before' | 'after' | 'general'
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[]
  /** Index of the photo to open. Pass `null` to keep the lightbox closed. */
  startIndex: number | null
  onClose: () => void
}

export function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const open = startIndex !== null
  const [index, setIndex] = useState(startIndex ?? 0)

  // Sync internal index when the trigger reopens with a new start.
  useEffect(() => {
    if (startIndex !== null) setIndex(startIndex)
  }, [startIndex])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose()
      else if (e.key === 'ArrowLeft')  prev()
      else if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photos.length])

  if (!open || photos.length === 0) return null

  function next() {
    setIndex(i => (i + 1) % photos.length)
  }
  function prev() {
    setIndex(i => (i - 1 + photos.length) % photos.length)
  }

  const current = photos[index]
  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-stretch"
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium tabular-nums">
          {index + 1} / {photos.length}
          {current.role && current.role !== 'general' && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-white/15">
              {current.role}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          aria-label="Close"
          className="p-2 -m-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image — clicking the empty space closes; clicking the image itself doesn't. */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        {current.localDataUrl ? (
          <img
            src={current.localDataUrl}
            alt={current.caption ?? `Photo ${index + 1}`}
            className="max-h-full max-w-full object-contain rounded-md select-none"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        ) : (
          <div className="text-white/60 text-sm">Photo unavailable offline</div>
        )}
      </div>

      {/* Caption */}
      {current.caption && (
        <div className="px-4 pb-2 text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
          {current.caption}
        </div>
      )}

      {/* Pager controls */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="flex items-center justify-center gap-1.5 pb-3" onClick={(e) => e.stopPropagation()}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/50',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
