import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getStoredEmail,
  getValidToken,
  handleCallback,
  initiateAuth,
  signOut as googleSignOut,
} from './GoogleAuth'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  isAuthenticated: boolean
  userEmail: string | null
  /** Redirects to Google OAuth. Does not return — triggers a full page redirect. */
  signIn: () => Promise<void>
  /** Clears all auth state and signs the user out. */
  signOut: () => void
  /** Returns a valid access token, refreshing silently if needed. Returns null if unauthenticated. */
  getToken: () => Promise<string | null>
}

// ─── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    void (async () => {
      // Step 1: Check for OAuth callback code in URL
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (code) {
        // Remove code + state from URL immediately to prevent reuse on refresh
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        window.history.replaceState({}, '', url.toString())

        try {
          await handleCallback(code)
        } catch (err) {
          console.error('[AuthContext] OAuth callback failed:', err)
        }
      } else if (error) {
        console.warn('[AuthContext] OAuth error from Google:', error)
        url.searchParams.delete('error')
        window.history.replaceState({}, '', url.toString())
      }

      // Step 2: Check for a valid token (either just exchanged or previously stored)
      const token = await getValidToken()
      if (token) {
        setIsAuthenticated(true)
        setUserEmail(getStoredEmail())
      }
    })()
  }, [])

  const signIn = useCallback(async () => {
    await initiateAuth()
    // initiateAuth redirects — execution stops here
  }, [])

  const signOut = useCallback(() => {
    googleSignOut()
    setIsAuthenticated(false)
    setUserEmail(null)
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    const token = await getValidToken()
    if (!token && isAuthenticated) {
      // Token is gone — force re-auth state
      setIsAuthenticated(false)
      setUserEmail(null)
    }
    return token
  }, [isAuthenticated])

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, signIn, signOut, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
