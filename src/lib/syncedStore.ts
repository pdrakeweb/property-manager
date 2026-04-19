/**
 * Sync-aware store wrapper — wraps makeStore<T> so that every
 * add/update/upsert also writes to localIndex with pending_upload
 * state, making records eligible for Drive sync via pushPending().
 *
 * Records are serialized to Drive as JSON (full IndexRecord), not markdown.
 * Human-readable markdown export is handled separately by markdownExport.ts.
 */

import { makeStore } from './localStore'
import { localIndex, type IndexRecordType } from './localIndex'
import { getPropertyById } from './propertyStore'

/**
 * Create a store that automatically syncs records to Drive via localIndex.
 *
 * @param key             localStorage key for the store
 * @param indexType       IndexRecordType for localIndex records
 * @param driveCategoryId Category ID for Drive folder resolution
 * @param getPropertyId   Optional — extract propertyId from record (defaults to `r.propertyId`)
 */
export function makeSyncedStore<T extends { id: string }>(
  key: string,
  indexType: IndexRecordType,
  driveCategoryId: string,
  getPropertyId?: (record: T) => string,
) {
  const store = makeStore<T>(key)

  const resolvePropertyId = getPropertyId ?? ((r: T) => (r as unknown as { propertyId: string }).propertyId)

  function syncToIndex(item: T): void {
    const propId = resolvePropertyId(item)
    if (!propId) return
    const property = getPropertyById(propId)
    const rootFolderId = property?.driveRootFolderId ?? ''

    // Don't queue if no Drive root (e.g. Camp with empty driveRootFolderId)
    if (!rootFolderId) return

    // Derive a human-readable title from common naming fields
    const typed = item as Record<string, unknown>
    const title = String(
      typed['label'] ?? typed['name'] ?? typed['title'] ?? typed['provider'] ??
      typed['taskTitle'] ?? `${indexType}_${(item as { id: string }).id.slice(0, 8)}`,
    )

    // JSON filename: <type>_<id>.json
    const filename = `${indexType}_${(item as { id: string }).id}.json`

    localIndex.upsert({
      id:         (item as { id: string }).id,
      type:       indexType,
      propertyId: propId,
      title,
      data: {
        ...(item as unknown as Record<string, unknown>),
        filename,
        rootFolderId,
        categoryId: driveCategoryId,
      },
      syncState: 'pending_upload',
    })
  }

  return {
    ...store,

    add(item: T): void {
      store.add(item)
      syncToIndex(item)
    },

    update(item: T): void {
      store.update(item)
      syncToIndex(item)
    },

    upsert(item: T): void {
      store.upsert(item)
      syncToIndex(item)
    },

    remove(id: string): void {
      store.remove(id)
      localIndex.softDelete(id)
    },
  }
}
