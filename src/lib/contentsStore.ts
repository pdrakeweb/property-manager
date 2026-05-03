import { makeSyncedStore } from './syncedStore'
import type { ContentItem } from '../records/contentItem'

/**
 * Sync-backed store for personal-property content items (Home Contents
 * Inventory). No mock seed — the store starts empty and items are added
 * by the user (or via CSV import).
 */
export const contentsStore = makeSyncedStore<ContentItem>(
  'pm_content_items',
  'content_item',
  'content_item',
)
