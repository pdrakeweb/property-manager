import { useEffect, useState } from 'react'
import { syncBus } from './syncBus'

/**
 * Re-renders the calling component whenever the local index changes (any
 * record upsert, soft delete, or remote pull). The returned number is
 * monotonically increasing and is intended as a `useMemo` / `useEffect`
 * dependency so derived computations recompute on every store mutation.
 *
 * Mirrors the subscription pattern used by `useProperties()` in propertyStore
 * but is generic across all index record types — DashboardScreen and
 * MaintenanceScreen previously relied on a manually bumped `tick` counter
 * combined with `key={tick}` to force a full subtree remount, which tore
 * down all local state on every mutation. Subscribing here makes those
 * screens re-render via normal React data flow without remounting.
 */
export function useIndexVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    return syncBus.subscribe(ev => {
      if (ev.type === 'index-updated') setVersion(v => v + 1)
    })
  }, [])
  return version
}
