/**
 * Single-purpose, dependency-free reader for a property's
 * `driveRootFolderId`.
 *
 * Why this file exists. `makeSyncedStore` needs to look up a property's
 * Drive root folder when queueing an upload (it goes into the index
 * record's `data.rootFolderId`). The natural API for that lookup is
 * `propertyStore.getById(id).driveRootFolderId` — but `propertyStore`
 * itself uses `makeSyncedStore` to back its own writes, which created
 * a hard cycle:
 *
 *     syncedStore.ts ──> propertyStore.ts
 *           ▲                 │
 *           └── makeSyncedStore at module load
 *
 * Vite's browser ESM pipeline tolerates the cycle (modules complete
 * top-level evaluation before any function actually runs), but Vite's
 * SSR pipeline (vite-node, used by Vitest) trips on the temporal
 * dead zone — `__vite_ssr_import_*` is `undefined` at the moment
 * `propertyStore.ts:28` calls `makeSyncedStore(...)` at module init.
 *
 * Both files want the same data — the property list at the
 * `pm_properties_v1` localStorage key. This file reads that key
 * directly, bypassing the cycle. It does NOT depend on `propertyStore`
 * (or anything else in this codebase), so importing it from either
 * side of the former cycle is safe.
 *
 * The reader is read-only by design: writes still go through
 * `propertyStore.upsert(...)` so the syncBus emit + index queue happen
 * uniformly. This file is only the lookup half.
 */

const PROPERTIES_KEY = 'pm_properties_v1'

interface PropertyShape {
  id: string
  driveRootFolderId?: string
}

/**
 * Returns the `driveRootFolderId` of the property with `propertyId`,
 * or an empty string if (a) localStorage is unavailable, (b) no
 * property with that id exists, or (c) the property has no Drive root
 * configured (e.g. a fresh seed). Empty string is the documented
 * "skip the upload queue" signal in `makeSyncedStore.syncToIndex`.
 */
export function getPropertyDriveRoot(propertyId: string): string {
  if (typeof localStorage === 'undefined') return ''
  try {
    const raw = localStorage.getItem(PROPERTIES_KEY)
    if (!raw) return ''
    const list = JSON.parse(raw) as PropertyShape[]
    if (!Array.isArray(list)) return ''
    const found = list.find(p => p?.id === propertyId)
    return found?.driveRootFolderId ?? ''
  } catch {
    return ''
  }
}
