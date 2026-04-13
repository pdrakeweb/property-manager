import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Building2, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

import { AppStoreProvider } from './store/AppStoreContext'
import { AppShell }             from './components/layout/AppShell'
import { DashboardScreen }      from './screens/DashboardScreen'
import { CaptureSelectScreen }  from './screens/CaptureSelectScreen'
import { EquipmentFormScreen }  from './screens/EquipmentFormScreen'
import { MaintenanceScreen }    from './screens/MaintenanceScreen'
import { BudgetScreen }         from './screens/BudgetScreen'
import { AIAdvisoryScreen }     from './screens/AIAdvisoryScreen'
import { InventoryScreen }      from './screens/InventoryScreen'
import { SettingsScreen }       from './screens/SettingsScreen'

import {
  isAuthenticated,
  startOAuthFlow,
  handleOAuthCallback,
  getClientId,
} from './auth/oauth'

// ── Sign-in screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  const [openRouterKey, setOpenRouterKey] = useState(
    () => localStorage.getItem('openrouter_api_key') ?? '',
  )
  const [clientId,    setClientId]    = useState(() => localStorage.getItem('google_client_id') ?? getClientId())
  const [showOrKey,   setShowOrKey]   = useState(false)
  const [showGcpId,   setShowGcpId]   = useState(false)
  const [error,       setError]       = useState('')
  const [signingIn,   setSigningIn]   = useState(false)

  function saveAndSignIn() {
    if (!clientId.trim()) {
      setError('Enter your Google Cloud OAuth Client ID to continue.')
      return
    }
    if (openRouterKey.trim()) {
      localStorage.setItem('openrouter_api_key', openRouterKey.trim())
    }
    localStorage.setItem('google_client_id', clientId.trim())
    setSigningIn(true)
    startOAuthFlow().catch(e => {
      setError(String(e))
      setSigningIn(false)
    })
  }

  // Allow bypassing auth for local dev
  function devBypass() {
    localStorage.setItem('google_access_token',     'dev_token')
    localStorage.setItem('google_token_expires_at', String(Date.now() + 3600_000))
    localStorage.setItem('google_user_email',       'dev@local')
    localStorage.setItem('google_user_name',        'Dev User')
    onSignIn()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Property Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in with Google to access your Drive records</p>
        </div>

        {/* Config card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">

          {/* Google Client ID */}
          <div className="p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Google OAuth Client ID
              <span className="text-slate-400 font-normal ml-1">— from Google Cloud Console</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showGcpId ? 'text' : 'password'}
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 font-mono placeholder:font-sans placeholder:text-slate-400"
              />
              <button onClick={() => setShowGcpId(s => !s)} className="text-slate-400 hover:text-slate-600 shrink-0">
                {showGcpId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Set once — stored in localStorage. Or set VITE_GOOGLE_CLIENT_ID in .env.
            </p>
          </div>

          {/* OpenRouter key */}
          <div className="p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              OpenRouter API Key
              <span className="text-slate-400 font-normal ml-1">— optional, enables AI features</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showOrKey ? 'text' : 'password'}
                value={openRouterKey}
                onChange={e => setOpenRouterKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 font-mono placeholder:font-sans placeholder:text-slate-400"
              />
              <button onClick={() => setShowOrKey(s => !s)} className="text-slate-400 hover:text-slate-600 shrink-0">
                {showOrKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Sign in button */}
        <button
          onClick={saveAndSignIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold transition-colors shadow-sm"
        >
          {signingIn ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting to Google…</>
          ) : (
            <>
              {/* Google icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        {/* Dev bypass */}
        {import.meta.env.DEV && (
          <button
            onClick={devBypass}
            className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors"
          >
            Skip auth (dev mode)
          </button>
        )}

      </div>
    </div>
  )
}

// ── OAuth callback handler ───────────────────────────────────────────────────

function OAuthCallbackHandler({ onDone }: { onDone: (ok: boolean) => void }) {
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const state  = params.get('state')
    const errMsg = params.get('error')

    if (errMsg) {
      setError(`Google denied access: ${errMsg}`)
      onDone(false)
      return
    }

    if (!code || !state) {
      onDone(false)
      return
    }

    // Clear the OAuth params from the URL without triggering a reload
    const cleanUrl = window.location.origin + window.location.pathname
    window.history.replaceState({}, '', cleanUrl)

    handleOAuthCallback(code, state)
      .then(() => onDone(true))
      .catch(e => {
        setError(String(e))
        onDone(false)
      })
  }, [onDone])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-sm text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-sky-600 hover:text-sky-700 font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Completing sign-in…</p>
      </div>
    </div>
  )
}

// ── Main app routes ──────────────────────────────────────────────────────────

function MainApp() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/"                    element={<ErrorBoundary fallbackTitle="Dashboard error"><DashboardScreen /></ErrorBoundary>}     />
            <Route path="/capture"             element={<ErrorBoundary fallbackTitle="Capture error"><CaptureSelectScreen /></ErrorBoundary>} />
            <Route path="/capture/:categoryId" element={<ErrorBoundary fallbackTitle="Form error"><EquipmentFormScreen /></ErrorBoundary>} />
            <Route path="/maintenance"         element={<ErrorBoundary fallbackTitle="Maintenance error"><MaintenanceScreen /></ErrorBoundary>}   />
            <Route path="/budget"              element={<ErrorBoundary fallbackTitle="Budget error"><BudgetScreen /></ErrorBoundary>}        />
            <Route path="/advisor"             element={<ErrorBoundary fallbackTitle="Advisor error"><AIAdvisoryScreen /></ErrorBoundary>}    />
            <Route path="/inventory"           element={<ErrorBoundary fallbackTitle="Inventory error"><InventoryScreen /></ErrorBoundary>}     />
            <Route path="/settings"            element={<ErrorBoundary fallbackTitle="Settings error"><SettingsScreen /></ErrorBoundary>}      />
            <Route path="*"                    element={<Navigate to="/" />}     />
          </Routes>
        </AppShell>
      </HashRouter>
    </ErrorBoundary>
  )
}

// ── Root: auth gate ──────────────────────────────────────────────────────────

type AuthState = 'checking' | 'callback' | 'authenticated' | 'unauthenticated'

export default function App() {
  const [authState, setAuthState] = useState<AuthState>(() => {
    // If we have ?code= in the URL it's an OAuth callback
    const params = new URLSearchParams(window.location.search)
    if (params.has('code')) return 'callback'
    return isAuthenticated() ? 'authenticated' : 'unauthenticated'
  })

  if (authState === 'callback') {
    return (
      <OAuthCallbackHandler
        onDone={ok => setAuthState(ok ? 'authenticated' : 'unauthenticated')}
      />
    )
  }

  if (authState === 'unauthenticated') {
    return <SignInScreen onSignIn={() => setAuthState('authenticated')} />
  }

  return (
    <AppStoreProvider>
      <MainApp />
    </AppStoreProvider>
  )
}
