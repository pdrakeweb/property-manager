import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// ── State shape ──────────────────────────────────────────────────────────────

interface AppStoreState {
  /** Active property ID (persisted to localStorage) */
  activePropertyId: string
}

interface AppStoreActions {
  setActivePropertyId: (id: string) => void
}

type AppStore = AppStoreState & AppStoreActions

// ── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStore | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [activePropertyId, setActivePropertyIdRaw] = useState<string>(
    () => localStorage.getItem('active_property_id') ?? 'tannerville',
  )

  const setActivePropertyId = useCallback((id: string) => {
    localStorage.setItem('active_property_id', id)
    setActivePropertyIdRaw(id)
  }, [])

  return (
    <AppStoreContext.Provider value={{ activePropertyId, setActivePropertyId }}>
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
