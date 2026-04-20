import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncBus } from '../lib/syncBus'
import { cn } from '../utils/cn'

/**
 * Small spinner shown whenever any background sync activity is in flight
 * (full pull, delta poll, or per-record fetch). Hidden when idle so it
 * doesn't add visual noise.
 */
export function BackgroundSyncIndicator() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    let count = 0
    const unsub = syncBus.subscribe(ev => {
      if (ev.type === 'sync-start') { count++; setActive(count) }
      else if (ev.type === 'sync-end') { count = Math.max(0, count - 1); setActive(count) }
    })
    return () => { unsub(); count = 0 }
  }, [])

  if (active === 0) return null
  return (
    <span
      title="Syncing with Drive…"
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-full',
        'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
      )}
    >
      <RefreshCw className="w-3 h-3 animate-spin" />
    </span>
  )
}
