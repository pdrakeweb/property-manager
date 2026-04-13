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
  isLoading: boolean
  userEmail: string | null
  error: string | null
  /** Redirects to Google OAuth. Does not return — triggers a full page redirect. */
  signIn: () => Promise<void>
  /** Clears all auth state and signs the user out. */
  signOut: () => void
  /** Returns a valid access token, refreshing silently if needed. Returns null if unauthenticated. */
  getToken: () => Promise<string | null>
}

// ─── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Auth Bypass (dev/CI mode) ─────────────────────────────────────────────────

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true'

// ─── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(AUTH_BYPASS)
  const [isLoading, setIsLoading] = useState(!AUTH_BYPASS)
  const [userEmail, setUserEmail] = useState<string | null>(AUTH_BYPASS ? 'dev@local' : null)
  const [error, setError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (AUTH_BYPASS || initialized.current) return
    initialized.current = true

    void (async () => {
      // Step 1: Check for OAuth callback code in URL
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const oauthError = url.searchParams.get('error')

      if (code) {
        // Remove code + state from URL immediately to prevent reuse on refresh
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        window.history.replaceState({}, '', url.toString())

        try {
          await handleCallback(code)
        } catch (err) {
          console.error('[AuthContext] OAuth callback failed:', err)
          setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
          setIsLoading(false)
          return
        }
      } else if (oauthError) {
        console.warn('[AuthContext] OAuth error from Google:', oauthError)
        url.searchParams.delete('error')
        window.history.replaceState({}, '', url.toString())
        setError(`Google denied access: ${oauthError}`)
        setIsLoading(false)
        return
      }

      // Step 2: Check for a valid token (either just exchanged or previously stored)
      const token = await getValidToken()
      if (token) {
        setIsAuthenticated(true)
        setUserEmail(getStoredEmail())
      }
      setIsLoading(false)
    })()
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    await initiateAuth()
    // initiateAuth redirects — execution stops here
  }, [])

  const signOut = useCallback(() => {
    googleSignOut()
    setIsAuthenticated(false)
    setUserEmail(null)
    setError(null)
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (AUTH_BYPASS) return null

    const token = await getValidToken()
    if (!token && isAuthenticated) {
      // Token is gone — force re-auth state
      setIsAuthenticated(false)
      setUserEmail(null)
      setError('Session expired. Please sign in again.')
    }
    return token
  }, [isAuthenticated])

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, userEmail, error, signIn, signOut, getToken }}>
      {AUTH_BYPASS && (
        <div className="fixed top-2 right-2 z-[9999] bg-amber-400 text-amber-900 text-xs font-bold px-2 py-1 rounded shadow-sm">
          DEV MODE
        </div>
      )}
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
