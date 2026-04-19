import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Property } from '../types'
import { propertyStore, seedPropertiesIfEmpty } from '../lib/propertyStore'

// Seed at module load so localStorage is populated before any component mounts.
// React 18 StrictMode double-invokes useState initializers, which can make
// in-function seeding behave surprisingly; doing it here is deterministic.
seedPropertiesIfEmpty()

// ── State shape ──────────────────────────────────────────────────────────────

interface AppStoreState {
  /** Active property ID (persisted to localStorage) */
  activePropertyId: string
  /** Live list of user-editable properties, reactive across the app */
  properties: Property[]
}

interface AppStoreActions {
  setActivePropertyId: (id: string) => void
  addProperty: (p: Property) => void
  updateProperty: (p: Property) => void
  removeProperty: (id: string) => void
}

type AppStore = AppStoreState & AppStoreActions

// ── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStore | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(() => propertyStore.getAll())

  const [activePropertyId, setActivePropertyIdRaw] = useState<string>(() => {
    const stored = localStorage.getItem('active_property_id')
    const all    = propertyStore.getAll()
    if (stored && all.some(p => p.id === stored)) return stored
    return all[0]?.id ?? 'tannerville'
  })

  // If the active property gets deleted elsewhere, fall back to the first one.
  useEffect(() => {
    if (!properties.some(p => p.id === activePropertyId) && properties[0]) {
      setActivePropertyIdRaw(properties[0].id)
      localStorage.setItem('active_property_id', properties[0].id)
    }
  }, [properties, activePropertyId])

  const setActivePropertyId = useCallback((id: string) => {
    localStorage.setItem('active_property_id', id)
    setActivePropertyIdRaw(id)
  }, [])

  const addProperty = useCallback((p: Property) => {
    propertyStore.add(p)
    setProperties(propertyStore.getAll())
  }, [])

  const updateProperty = useCallback((p: Property) => {
    propertyStore.update(p)
    setProperties(propertyStore.getAll())
  }, [])

  const removeProperty = useCallback((id: string) => {
    propertyStore.remove(id)
    setProperties(propertyStore.getAll())
  }, [])

  return (
    <AppStoreContext.Provider
      value={{
        activePropertyId, setActivePropertyId,
        properties, addProperty, updateProperty, removeProperty,
      }}
    >
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

/** Convenience hook for components that only need the property list. */
export function useProperties() {
  const { properties, addProperty, updateProperty, removeProperty } = useAppStore()
  return { properties, addProperty, updateProperty, removeProperty }
}
