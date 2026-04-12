import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// ── State shape ──────────────────────────────────────────────────────────────

interface AppStoreState {
  /** Number of Drive files per category ID (from real Drive listing) */
  driveFileCounts: Record<string, number>
  /** Whether Drive counts have ever been loaded for a given category */
  driveCountsLoaded: Record<string, boolean>
  /** Active property ID (persisted to localStorage) */
  activePropertyId: string
}

interface AppStoreActions {
  setDriveFileCount: (categoryId: string, count: number) => void
  setActivePropertyId: (id: string) => void
}

type AppStore = AppStoreState & AppStoreActions

// ── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStore | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [driveFileCounts,   setDriveFileCounts]   = useState<Record<string, number>>({})
  const [driveCountsLoaded, setDriveCountsLoaded] = useState<Record<string, boolean>>({})
  const [activePropertyId,  setActivePropertyIdRaw] = useState<string>(
    () => localStorage.getItem('active_property_id') ?? 'tannerville',
  )

  const setDriveFileCount = useCallback((categoryId: string, count: number) => {
    setDriveFileCounts(prev => ({ ...prev, [categoryId]: count }))
    setDriveCountsLoaded(prev => ({ ...prev, [categoryId]: true }))
  }, [])

  const setActivePropertyId = useCallback((id: string) => {
    localStorage.setItem('active_property_id', id)
    setActivePropertyIdRaw(id)
  }, [])

  return (
    <AppStoreContext.Provider value={{
      driveFileCounts,
      driveCountsLoaded,
      activePropertyId,
      setDriveFileCount,
      setActivePropertyId,
    }}>
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
