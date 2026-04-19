import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Property } from '../types'
import { propertyStore } from '../lib/propertyStore'
import { PROPERTIES } from '../data/mockData'

function loadProperties(): Property[] {
  if (!propertyStore.hasAny()) {
    for (const p of PROPERTIES) propertyStore.upsert(p)
  }
  return propertyStore.getAll()
}

// ── State shape ──────────────────────────────────────────────────────────────

interface AppStoreState {
  activePropertyId: string
  properties: Property[]
}

interface AppStoreActions {
  setActivePropertyId: (id: string) => void
  /** Re-read properties from localStorage — call after sync or after add/edit/delete. */
  refreshProperties: () => void
}

type AppStore = AppStoreState & AppStoreActions

// ── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStore | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(() => loadProperties())

  const [activePropertyId, setActivePropertyIdRaw] = useState<string>(() => {
    const stored = localStorage.getItem('active_property_id')
    const all    = loadProperties()
    // Validate stored ID is still a real property; fall back to first
    if (stored && all.some(p => p.id === stored)) return stored
    return all[0]?.id ?? ''
  })

  const setActivePropertyId = useCallback((id: string) => {
    localStorage.setItem('active_property_id', id)
    setActivePropertyIdRaw(id)
  }, [])

  const refreshProperties = useCallback(() => {
    const all = propertyStore.getAll()
    setProperties(all)
    // If active property was removed, fall back to first
    setActivePropertyIdRaw(prev => {
      if (all.some(p => p.id === prev)) return prev
      const first = all[0]?.id ?? ''
      localStorage.setItem('active_property_id', first)
      return first
    })
  }, [])

  return (
    <AppStoreContext.Provider value={{ activePropertyId, setActivePropertyId, properties, refreshProperties }}>
      {children}
    </AppStoreContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAppStore(): AppStore {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used inside AppStoreProvider')
  return ctx
}
