import type { Property } from '../types'

const STORE_KEY     = 'pm_properties_v1'
const FILE_ID_KEY   = 'pm_properties_file_id'

function load(): Property[] {
  try {
    const s = localStorage.getItem(STORE_KEY)
    if (s) return JSON.parse(s) as Property[]
  } catch { /* ignore */ }
  return []
}

function save(props: Property[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(props))
}

export const propertyStore = {
  getAll(): Property[] { return load() },

  getById(id: string): Property | null {
    return load().find(p => p.id === id) ?? null
  },

  upsert(property: Property): void {
    const all = load()
    const idx = all.findIndex(p => p.id === property.id)
    if (idx >= 0) all[idx] = property
    else all.push(property)
    save(all)
  },

  remove(id: string): void {
    save(load().filter(p => p.id !== id))
  },

  hasAny(): boolean {
    return load().length > 0
  },

  /** Replace entire list — used when pulling from Drive on a fresh device. */
  replaceAll(props: Property[]): void {
    save(props)
  },

  /** ID of the Drive file that holds the serialized property list. */
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
 */
export async function seedPropertiesFromMock(): Promise<void> {
  if (propertyStore.hasAny()) return
  const { PROPERTIES } = await import('../data/mockData')
  for (const p of PROPERTIES) propertyStore.upsert(p)
}

