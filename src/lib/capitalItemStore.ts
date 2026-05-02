import { makeSyncedStore } from './syncedStore'
import { CAPITAL_ITEMS } from '../data/mockData'
import type { CapitalItem } from '../types'

const STORAGE_KEY = 'pm_capital_items'
const SEEDED_KEY  = 'pm_capital_items_seeded_v1'

export const capitalItemStore = makeSyncedStore<CapitalItem>(
  STORAGE_KEY, 'capital_item', 'capital',
)

function seedFromMockOnce(): void {
  if (localStorage.getItem(SEEDED_KEY) === '1') return
  const existing = capitalItemStore.getAll()
  const existingIds = new Set(existing.map(i => i.id))
  const merged = [
    ...existing,
    ...CAPITAL_ITEMS.filter(c => !existingIds.has(c.id)),
  ]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  localStorage.setItem(SEEDED_KEY, '1')
}

export function getCapitalItems(): CapitalItem[] {
  seedFromMockOnce()
  return capitalItemStore.getAll()
}

export function getCapitalItemsForProperty(propertyId: string): CapitalItem[] {
  return getCapitalItems().filter(i => i.propertyId === propertyId)
}

export function getCapitalItemById(id: string): CapitalItem | undefined {
  seedFromMockOnce()
  return capitalItemStore.getById(id)
}
