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
import { getPropertyDriveRoot } from './propertyDriveRoot'
import { auditLog } from './auditLog'
import { getDefinition } from '../records/registry'
import { resolveTitle } from '../records/_framework'

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

  // Look up the DSL definition once per store — the registry is immutable at
  // module init, so caching here saves a dict lookup on every write/read.
  const def = getDefinition(indexType)

  /** Derive a stable fallback title when the DSL title fn fails or is missing. */
  function fallbackTitle(id: string): string {
    return `${indexType}_${id.slice(0, 8)}`
  }

  /**
   * Derive the display title — DSL definition first (variant-aware), then a
   * stable fallback. The old ad-hoc heuristic (`label ?? name ?? title ?? …`)
   * is gone now that every registered type has a `title()` function.
   */
  function deriveTitle(item: T): string {
    const id = (item as { id: string }).id
    const fb = fallbackTitle(id)
    if (!def) return fb
    try {
      const raw = resolveTitle(def, item as unknown as Record<string, unknown>)
      return raw ? String(raw) : fb
    } catch {
      return fb
    }
  }

  function syncToIndex(item: T): void {
    const propId = resolvePropertyId(item)
    if (!propId) return
    // Read driveRootFolderId via the dependency-free helper rather than
    // `propertyStore.getById` to keep this file off the syncedStore↔
    // propertyStore cycle. See `lib/propertyDriveRoot.ts` for the why.
    const rootFolderId = getPropertyDriveRoot(propId)

    // Don't queue if no Drive root (e.g. Camp with empty driveRootFolderId)
    if (!rootFolderId) return

    // Runtime validation against the registered Zod schema. Invalid writes are
    // still queued (the UI has already persisted them locally) but logged so
    // form/regression bugs surface in the audit trail. We don't throw here
    // because screens already do form-level validation; this is defense in
    // depth, not the primary gate.
    if (def) {
      const result = def.schema.safeParse(item)
      if (!result.success) {
        const errs = result.error.issues
          .slice(0, 5)
          .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')
        auditLog.warn(`${indexType}.validate`, `Invalid ${indexType}: ${errs}`, propId)
      }
    }

    const title    = deriveTitle(item)
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
      auditLog.info(`${indexType}.add`, `Added: ${deriveTitle(item)}`, resolvePropertyId(item) || undefined)
    },

    update(item: T): void {
      store.update(item)
      syncToIndex(item)
      auditLog.info(`${indexType}.update`, `Updated: ${deriveTitle(item)}`, resolvePropertyId(item) || undefined)
    },

    upsert(item: T): void {
      store.upsert(item)
      syncToIndex(item)
    },

    remove(id: string): void {
      const existing = store.getById(id)
      store.remove(id)
      localIndex.softDelete(id)
      if (existing) {
        auditLog.info(
          `${indexType}.remove`,
          `Removed: ${deriveTitle(existing)}`,
          resolvePropertyId(existing) || undefined,
        )
      }
    },
  }
}
