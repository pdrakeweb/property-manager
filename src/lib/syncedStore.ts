/**
 * Sync-aware store wrapper — wraps makeStore<T> so that every
 * add/update/upsert also writes to localIndex with pending_upload
 * state, making records eligible for Drive sync via pushPending().
 */

import { makeStore } from './localStore'
import { localIndex, type IndexRecordType } from './localIndex'
import { PROPERTIES } from '../data/mockData'

/**
 * Create a store that automatically syncs records to Drive via localIndex.
 *
 * @param key             localStorage key for the store
 * @param indexType       IndexRecordType for localIndex records
 * @param driveCategoryId Category ID for Drive folder resolution
 * @param formatMd        Function to generate markdown content from a record
 * @param makeFilename    Function to generate a Drive filename from a record
 * @param getPropertyId   Optional — extract propertyId from record (defaults to `r.propertyId`)
 */
export function makeSyncedStore<T extends { id: string }>(
  key: string,
  indexType: IndexRecordType,
  driveCategoryId: string,
  formatMd: (record: T) => string,
  makeFilename: (record: T) => string,
  getPropertyId?: (record: T) => string,
) {
  const store = makeStore<T>(key)

  const resolvePropertyId = getPropertyId ?? ((r: T) => (r as unknown as { propertyId: string }).propertyId)

  function syncToIndex(item: T): void {
    const propId = resolvePropertyId(item)
    if (!propId) return
    const property = PROPERTIES.find(p => p.id === propId)
    const rootFolderId = property?.driveRootFolderId ?? ''

    // Don't queue if no Drive root (e.g. Camp with empty driveRootFolderId)
    if (!rootFolderId) return

    const mdContent = formatMd(item)
    const filename = makeFilename(item)

    localIndex.upsert({
      id: (item as unknown as { id: string }).id,
      type: indexType,
      propertyId: propId,
      title: filename.replace(/\.md$/, ''),
      data: {
        ...item as unknown as Record<string, unknown>,
        mdContent,
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
