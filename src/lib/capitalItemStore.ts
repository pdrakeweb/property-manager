/**
 * Capital items store — user-editable list of forecasted capital projects.
 *
 * Seeded from the hardcoded CAPITAL_ITEMS on first load. After that, the
 * user can add/edit/remove items through the Budget screen.
 */

import { makeStore } from './localStore'
import { CAPITAL_ITEMS } from '../data/mockData'
import type { CapitalItem } from '../types'

export const capitalItemStore = makeStore<CapitalItem>('pm_capital_items')

export function seedCapitalItemsIfEmpty(): void {
  if (capitalItemStore.getAll().length > 0) return
  for (const item of CAPITAL_ITEMS) capitalItemStore.add(item)
}

export function getCapitalItemsForProperty(propertyId: string): CapitalItem[] {
  seedCapitalItemsIfEmpty()
  return capitalItemStore.getAll().filter(i => i.propertyId === propertyId)
}

export function getAllCapitalItems(): CapitalItem[] {
  seedCapitalItemsIfEmpty()
  return capitalItemStore.getAll()
}
