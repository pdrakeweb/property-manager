/**
 * Property store — first-class records in localIndex (type 'property').
 *
 * Uses the makeSyncedStore pattern (insurance/permit) so writes mirror into
 * localIndex with syncState='pending_upload'. Property records are
 * self-referential: each property's `propertyId` (for index purposes) equals
 * its own `id`, which lets the rest of the sync machinery reuse a property's
 * own driveRootFolderId for upload.
 *
 * The legacy storage key (`pm_properties_v1`) is preserved for back-compat
 * with users upgrading in place — `makeStore` reads/writes the same key.
 *
 * Reactivity: `useProperties()` subscribes to `syncBus` so React components
 * re-render whenever any property record changes (locally or via cross-tab
 * BroadcastChannel).
 */

import { useEffect, useState } from 'react'
import { makeSyncedStore } from './syncedStore'
import { syncBus } from './syncBus'
import { PROPERTIES } from '../data/mockData'
import type { Property } from '../types'

const FILE_ID_KEY = 'pm_properties_file_id'

// Lazy-init the underlying synced store. We *cannot* invoke
// `makeSyncedStore` at module load: the chain
//   syncedStore → localIndex → vaultSingleton → propertyStore → syncedStore
// is a 5-node import cycle. Vite's browser pipeline tolerates the cycle
// (every module finishes top-level evaluation before any function runs),
// but Vite's SSR pipeline (used by Vitest + the Phase D vault test
// harness) tracks each import as a lazy `__vite_ssr_import_*` binding —
// calling `getDefinition(...)` from a syncedStore body that's still
// mid-load throws TDZ.
//
// Self-referential propertyId — properties are records of themselves, so
// their owning propertyId for index/sync purposes is their own id.
let _baseStore: ReturnType<typeof makeSyncedStore<Property>> | null = null
function baseStore(): ReturnType<typeof makeSyncedStore<Property>> {
  if (_baseStore) return _baseStore
  _baseStore = makeSyncedStore<Property>(
    'pm_properties_v1', 'property', 'property',
    (p) => p.id,
  )
  return _baseStore
}

/** Sorted-by-name list of properties. */
function getAllSorted(): Property[] {
  return [...baseStore().getAll()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Always-fire notification for property mutations. makeSyncedStore skips the
 * localIndex queue (and therefore the syncBus 'index-updated' event) when a
 * property has no driveRootFolderId — but useProperties() needs to refresh
 * regardless of whether the record is eligible for Drive upload, so we emit
 * directly here.
 */
function notifyPropertyChange(id: string): void {
  syncBus.emit({ type: 'index-updated', recordIds: [id], source: 'local' })
}

export const propertyStore = {
  getAll(): Property[] { return getAllSorted() },

  getById(id: string): Property | null {
    return baseStore().getById(id) ?? null
  },

  upsert(property: Property): void {
    baseStore().upsert(property)
    notifyPropertyChange(property.id)
  },

  add(property: Property): void {
    baseStore().add(property)
    notifyPropertyChange(property.id)
  },

  update(property: Property): void {
    baseStore().update(property)
    notifyPropertyChange(property.id)
  },

  remove(id: string): void {
    baseStore().remove(id)
    notifyPropertyChange(id)
  },

  hasAny(): boolean {
    return baseStore().getAll().length > 0
  },

  /** Replace entire list — used when pulling from Drive on a fresh device. */
  replaceAll(props: Property[]): void {
    const store = baseStore()
    for (const existing of store.getAll()) {
      if (!props.some(p => p.id === existing.id)) store.remove(existing.id)
    }
    for (const p of props) store.upsert(p)
    syncBus.emit({ type: 'index-updated', recordIds: props.map(p => p.id), source: 'remote' })
  },

  /** ID of the legacy global config file (`pm_properties.json`) on Drive. */
  getDriveFileId(): string | null {
    return localStorage.getItem(FILE_ID_KEY)
  },
  setDriveFileId(id: string): void {
    localStorage.setItem(FILE_ID_KEY, id)
  },
}

/**
 * Seed from the legacy PROPERTIES mock array the first time the app runs.
 * No-op if properties are already stored.
 *
 * Synchronous so the AppStoreProvider can call it during initial render
 * setup without flashing an empty UI.
 */
export function seedPropertiesFromMock(): void {
  if (propertyStore.hasAny()) return
  for (const p of PROPERTIES) propertyStore.upsert(p)
}

/**
 * React hook returning the live, name-sorted property list. Re-renders on any
 * index update event (local mutation, sync pull, or cross-tab broadcast).
 */
export function useProperties(): Property[] {
  const [props, setProps] = useState<Property[]>(() => propertyStore.getAll())

  useEffect(() => {
    const refresh = () => setProps(propertyStore.getAll())
    const unsub = syncBus.subscribe(ev => {
      if (ev.type === 'index-updated') refresh()
    })
    // Refresh on focus too — covers writes that bypass syncBus (rare).
    window.addEventListener('focus', refresh)
    return () => {
      unsub()
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return props
}
