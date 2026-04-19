/**
 * Property store — user-editable list of properties.
 *
 * Seeded from DEFAULT_PROPERTIES on first load so existing users keep
 * their data. After that, reads and writes go through localStorage.
 *
 * Properties are the parent scope for all other records, so they don't
 * have a propertyId of their own and can't use makeSyncedStore.
 */

import { makeStore } from './localStore'
import { DEFAULT_PROPERTIES } from '../data/mockData'
import type { Property } from '../types'

export const propertyStore = makeStore<Property>('pm_properties')

/** Copy DEFAULT_PROPERTIES into the store on first load. Safe to call repeatedly. */
export function seedPropertiesIfEmpty(): void {
  if (propertyStore.getAll().length > 0) return
  for (const p of DEFAULT_PROPERTIES) propertyStore.add(p)
}

export function getPropertyById(id: string): Property | undefined {
  return propertyStore.getById(id)
}

export function getAllProperties(): Property[] {
  return propertyStore.getAll()
}
