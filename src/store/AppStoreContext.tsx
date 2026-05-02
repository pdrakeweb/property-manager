import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Property } from '../types'
import { propertyStore, seedPropertiesFromMock, useProperties } from '../lib/propertyStore'

// ── State shape ──────────────────────────────────────────────────────────────

interface AppStoreState {
  activePropertyId: string
  properties: Property[]
}

interface AppStoreActions {
  setActivePropertyId: (id: string) => void
  /** Re-read properties from localStorage — kept for back-compat with callers
   *  that still want to force a refresh. The list is now reactive via syncBus
   *  so most callers don't need to invoke this. */
  refreshProperties: () => void
}

type AppStore = AppStoreState & AppStoreActions

// ── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStore | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // Migration: seed from mock data on first run. Hook order guarantees this
  // useState initializer runs before useProperties() reads the store below.
  useState(() => { seedPropertiesFromMock(); return true })

  const properties = useProperties()

  const [activePropertyId, setActivePropertyIdRaw] = useState<string>(() => {
    const stored = localStorage.getItem('active_property_id')
    const all    = propertyStore.getAll()
    if (stored && all.some(p => p.id === stored)) return stored
    return all[0]?.id ?? ''
  })

  // If the active property gets deleted (locally or via sync), fall back to
  // the first available one. Runs whenever `properties` changes.
  useEffect(() => {
    if (properties.length === 0) return
    if (!properties.some(p => p.id === activePropertyId)) {
      const first = properties[0].id
      localStorage.setItem('active_property_id', first)
      setActivePropertyIdRaw(first)
    }
  }, [properties, activePropertyId])

  const setActivePropertyId = useCallback((id: string) => {
    localStorage.setItem('active_property_id', id)
    setActivePropertyIdRaw(id)
  }, [])

  const refreshProperties = useCallback(() => {
    // No-op now that `useProperties` is reactive — kept for back-compat. The
    // syncBus 'index-updated' event will trigger a re-render automatically.
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
