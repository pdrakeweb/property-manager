import { useState, useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Building2, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

import { AppStoreProvider } from './store/AppStoreContext'
import { AppShell }             from './components/layout/AppShell'
import { ErrorBoundary }        from './components/ErrorBoundary'
import { ScreenSkeleton }       from './components/ScreenSkeleton'
import { DashboardScreen }      from './screens/DashboardScreen'
import { CaptureSelectScreen }  from './screens/CaptureSelectScreen'
import { InventoryScreen }      from './screens/InventoryScreen'
import { ExpiryManageScreen }   from './screens/ExpiryManageScreen'
import { SepticScreen }         from './screens/SepticScreen'
import { PropertyProfileScreen }       from './screens/PropertyProfileScreen'
import { EquipmentDetailScreen }       from './screens/EquipmentDetailScreen'
import { syncAll, seedTasksForProperty, syncPropertyConfig, syncAuditLog, pollDriveChanges, syncPendingPhotos } from './lib/syncEngine'
import { pollAllInboxes } from './lib/inboxPoller'
import { exportAllMarkdownToDrive } from './lib/markdownExport'
import { propertyStore, seedPropertiesFromMock } from './lib/propertyStore'
import { installFocusPolling } from './lib/haAlerts'
import {
  isAuthenticated,
  startOAuthFlow,
  handleOAuthCallback,
  getClientId,
  getValidToken,
  getAuthRefreshFailedAt,
  clearAuthRefreshFailed,
} from './auth/oauth'
import { getOpenRouterKey, setSetting, SETTINGS } from './store/settings'

// Lazy-loaded heavy screens (>400 lines, not on first load) — split into per-route chunks
const BudgetScreen             = lazy(() => import('./screens/BudgetScreen').then(m => ({ default: m.BudgetScreen })))
const AIAdvisoryScreen         = lazy(() => import('./screens/AIAdvisoryScreen').then(m => ({ default: m.AIAdvisoryScreen })))
const WellTestScreen           = lazy(() => import('./screens/WellTestScreen').then(m => ({ default: m.WellTestScreen })))
const TaxScreen                = lazy(() => import('./screens/TaxScreen').then(m => ({ default: m.TaxScreen })))
const MortgageScreen           = lazy(() => import('./screens/MortgageScreen').then(m => ({ default: m.MortgageScreen })))
const InsuranceScreen          = lazy(() => import('./screens/InsuranceScreen').then(m => ({ default: m.InsuranceScreen })))
const EquipmentFormScreen      = lazy(() => import('./screens/EquipmentFormScreen').then(m => ({ default: m.EquipmentFormScreen })))
const MaintenanceScreen        = lazy(() => import('./screens/MaintenanceScreen').then(m => ({ default: m.MaintenanceScreen })))
const SettingsScreen           = lazy(() => import('./screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })))
const VendorScreen             = lazy(() => import('./screens/VendorScreen').then(m => ({ default: m.VendorScreen })))
const EmergencyScreen          = lazy(() => import('./screens/EmergencyScreen').then(m => ({ default: m.EmergencyScreen })))
const FuelScreen               = lazy(() => import('./screens/FuelScreen').then(m => ({ default: m.FuelScreen })))
const UtilityScreen            = lazy(() => import('./screens/UtilityScreen').then(m => ({ default: m.UtilityScreen })))
const CalendarScreen           = lazy(() => import('./screens/CalendarScreen').then(m => ({ default: m.CalendarScreen })))
const PermitsScreen            = lazy(() => import('./screens/PermitsScreen').then(m => ({ default: m.PermitsScreen })))
const ChecklistScreen          = lazy(() => import('./screens/ChecklistScreen').then(m => ({ default: m.ChecklistScreen })))
const ChecklistRunScreen       = lazy(() => import('./screens/ChecklistRunScreen').then(m => ({ default: m.ChecklistRunScreen })))
const ChecklistGuidedScreen    = lazy(() => import('./screens/ChecklistGuidedScreen').then(m => ({ default: m.ChecklistGuidedScreen })))
const GeneratorScreen          = lazy(() => import('./screens/GeneratorScreen').then(m => ({ default: m.GeneratorScreen })))
const RoadScreen               = lazy(() => import('./screens/RoadScreen').then(m => ({ default: m.RoadScreen })))
const ConflictResolutionScreen = lazy(() => import('./screens/ConflictResolutionScreen').then(m => ({ default: m.ConflictResolutionScreen })))
const SyncScreen               = lazy(() => import('./screens/SyncScreen').then(m => ({ default: m.SyncScreen })))
const ActivityScreen           = lazy(() => import('./screens/ActivityScreen').then(m => ({ default: m.ActivityScreen })))
const MapScreen                = lazy(() => import('./screens/MapScreen').then(m => ({ default: m.MapScreen })))
const SearchScreen             = lazy(() => import('./screens/SearchScreen').then(m => ({ default: m.SearchScreen })))
const InspectionScreen         = lazy(() => import('./screens/InspectionScreen').then(m => ({ default: m.InspectionScreen })))
const RiskBriefScreen          = lazy(() => import('./screens/RiskBriefScreen').then(m => ({ default: m.RiskBriefScreen })))
const ImportScreen             = lazy(() => import('./screens/ImportScreen').then(m => ({ default: m.ImportScreen })))
const ContentsScreen           = lazy(() => import('./screens/ContentsScreen').then(m => ({ default: m.ContentsScreen })))
const HomeBookScreen           = lazy(() => import('./screens/HomeBookScreen').then(m => ({ default: m.HomeBookScreen })))

// ── Sign-in screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  // Pre-filled from .env or localStorage — hide fields when already set
  const envClientId = getClientId()
  const envOrKey    = getOpenRouterKey()

  const [clientId,    setClientId]    = useState(() => localStorage.getItem('google_client_id') ?? envClientId)
  const [openRouterKey, setOpenRouterKey] = useState(() => envOrKey)
  const [showOrKey,   setShowOrKey]   = useState(false)
  const [showGcpId,   setShowGcpId]   = useState(false)
  const [error,       setError]       = useState('')
  const [signingIn,   setSigningIn]   = useState(false)
  // Captured once on mount — _persistTokens clears the flag so re-rendering
  // after a successful sign-in won't show the banner.
  const [refreshFailedAt] = useState(() => getAuthRefreshFailedAt())

  const hasClientId = !!envClientId
  const hasOrKey    = !!envOrKey

  function saveAndSignIn() {
    const finalClientId = hasClientId ? envClientId : clientId.trim()
    if (!finalClientId) {
      setError('Enter your Google Cloud OAuth Client ID to continue.')
      return
    }
    if (!hasOrKey && openRouterKey.trim()) {
      setSetting(SETTINGS.openRouterKey, openRouterKey.trim())
    }
    if (!hasClientId) {
      localStorage.setItem('google_client_id', finalClientId)
    }
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
    clearAuthRefreshFailed()
    onSignIn()
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Property Manager</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sign in with Google to access your Drive records</p>
        </div>

        {/* Reconnect banner — set when an automatic refresh fails so the user
            isn't silently bounced back to the sign-in screen. */}
        {refreshFailedAt && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Session expired</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Please reconnect Google Drive to keep syncing your records.
              </p>
            </div>
          </div>
        )}

        {/* Config card — only show fields not already set via .env */}
        {(!hasClientId || !hasOrKey) && (
        <div className="card-surface rounded-2xl shadow-sm card-divider">

          {/* Google Client ID — hidden when VITE_GOOGLE_CLIENT_ID is set */}
          {!hasClientId && (
          <div className="p-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Google OAuth Client ID
              <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">— from Google Cloud Console</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showGcpId ? 'text' : 'password'}
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                className="flex-1 text-sm input-surface rounded-xl px-3 py-2.5 font-mono placeholder:font-sans"
              />
              <button onClick={() => setShowGcpId(s => !s)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
                {showGcpId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
              Set once — stored in localStorage. Or set VITE_GOOGLE_CLIENT_ID in .env.
            </p>
          </div>
          )}

          {/* OpenRouter key — hidden when VITE_OPENROUTER_KEY is set */}
          {!hasOrKey && (
          <div className="p-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              OpenRouter API Key
              <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">— optional, enables AI features</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showOrKey ? 'text' : 'password'}
                value={openRouterKey}
                onChange={e => setOpenRouterKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className="flex-1 text-sm input-surface rounded-xl px-3 py-2.5 font-mono placeholder:font-sans"
              />
              <button onClick={() => setShowOrKey(s => !s)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
                {showOrKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          )}
        </div>
        )}

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
          className="btn btn-info btn-lg btn-block gap-3 shadow-sm"
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
        console.error('OAuth callback failed:', e)
        setError(String(e))
        // Don't call onDone(false) — let the user see the error
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

// ── Startup sync hook ────────────────────────────────────────────────────────

// If the tab was hidden longer than this, the user may have edited data on
// another device. Pull from Drive before they interact to avoid stale-write
// conflicts. Matches the 10-minute threshold specified for multi-device safety.
const STALE_AFTER_MS = 10 * 60_000

function useStartupSync() {
  useEffect(() => {
    // 1. Migrate: seed properties from mock data if localStorage is empty
    seedPropertiesFromMock()

    // Install HA alert polling (runs on focus + visibility change). Idempotent
    // and self-quieting when HA is unconfigured, so it's safe to install
    // unconditionally at boot.
    installFocusPolling()

    // 2. Seed tasks for all properties immediately (no network needed)
    const seedAll = async () => {
      for (const p of propertyStore.getAll()) await seedTasksForProperty(p.id)
    }
    seedAll()

    // 3. Async Drive sync — sync property config, pull remote files, push pending
    let running = false
    async function run() {
      if (running) return
      running = true
      try {
        const token = await getValidToken()
        if (!token) return
        // Sync property config first so we have all properties before syncing records
        await syncPropertyConfig(token)
        // syncAll pulls from Drive before pushing local pending changes, so the
        // local index reflects remote edits (from other devices) before the
        // user starts entering data on this device.
        for (const p of propertyStore.getAll()) {
          await syncAll(token, p.id)
        }
        // Upload any photos that are still base64-only in localStorage and
        // backfill driveFileId on the corresponding completed_event records.
        // Runs after syncAll's pushPending so the JSON record is on Drive
        // before its photo blobs follow; the next cycle then re-pushes the
        // record with localDataUrl cleared.
        await syncPendingPhotos()
        await syncAuditLog(token)
        // Inbox poll runs after syncAll so anything Claude (or another
        // device) dropped into Drive surfaces in the Import tab on next
        // tick. Failures inside pollAllInboxes are non-fatal by design.
        await pollAllInboxes(token)
        localStorage.setItem('pm_last_sync_at', new Date().toISOString())
      } catch {
        // Non-fatal — app works offline from local index
      } finally {
        running = false
      }
    }

    // Always sync on mount — this covers both fresh login (MainApp mounts right
    // after the OAuth callback lands) and page reload while already signed in.
    run()

    // Re-run every 5 minutes to flush any pending uploads
    const interval = setInterval(run, 5 * 60_000)

    // Lightweight delta polling via Drive's changes API — every 30s while the
    // tab is visible. Much cheaper than the full `run()` and gives near-real-
    // time updates when another device writes to Drive.
    let pollRunning = false
    async function poll() {
      if (pollRunning || document.visibilityState !== 'visible') return
      pollRunning = true
      try {
        const token = await getValidToken()
        if (!token) return
        await pollDriveChanges(token)
      } catch {
        // Non-fatal — next poll retries
      } finally {
        pollRunning = false
      }
    }
    const deltaInterval = setInterval(poll, 30_000)

    // Multi-device safety: when the tab regains focus/visibility, resync if
    // enough time has passed that another device could have made changes.
    // Check last sync timestamp (not just hidden time) so a user who left the
    // tab open but walked away still gets fresh data on return.
    const isStale = () => {
      const last = localStorage.getItem('pm_last_sync_at')
      if (!last) return true
      const ts = new Date(last).getTime()
      if (Number.isNaN(ts)) return true
      return Date.now() - ts > STALE_AFTER_MS
    }
    // Inbox polling fires on every focus regardless of staleness — Drive
    // drops are cheap to check and the latency/value tradeoff favors fresh
    // queue counts over conservative sync.
    let inboxPolling = false
    const pollInboxOnFocus = async () => {
      if (inboxPolling) return
      inboxPolling = true
      try {
        const token = await getValidToken()
        if (!token) return
        await pollAllInboxes(token)
      } catch {
        // Non-fatal
      } finally {
        inboxPolling = false
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isStale()) run()
        pollInboxOnFocus()
      }
    }
    const onFocus = () => {
      if (isStale()) run()
      pollInboxOnFocus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      clearInterval(deltaInterval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const MD_EXPORT_KEY    = 'pm_last_md_export_at'
const MD_EXPORT_INTERVAL_MS = 6 * 60 * 60_000   // 6 hours

// ── Scheduled markdown export hook ──────────────────────────────────────────

function useScheduledMarkdownExport() {
  useEffect(() => {
    let running = false

    async function maybeExport() {
      if (running) return
      const last = localStorage.getItem(MD_EXPORT_KEY)
      const due  = !last || (Date.now() - new Date(last).getTime()) >= MD_EXPORT_INTERVAL_MS
      if (!due) return

      running = true
      try {
        const token = await getValidToken()
        if (!token) return
        for (const p of propertyStore.getAll()) {
          await exportAllMarkdownToDrive(token, p.id)
        }
        localStorage.setItem(MD_EXPORT_KEY, new Date().toISOString())
      } catch {
        // Non-fatal
      } finally {
        running = false
      }
    }

    maybeExport()
    // Check every hour; actually exports only if 6 h have elapsed
    const interval = setInterval(maybeExport, 60 * 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ── Main app routes ──────────────────────────────────────────────────────────

function MainApp() {
  useStartupSync()
  useScheduledMarkdownExport()

  return (
    <HashRouter>
      <AppShell>
        <ErrorBoundary>
        <Suspense fallback={<ScreenSkeleton />}>

        <Routes>
          <Route path="/"                    element={<DashboardScreen />}     />
          <Route path="/capture"             element={<CaptureSelectScreen />} />
          <Route path="/capture/:categoryId" element={<EquipmentFormScreen />} />
          <Route path="/maintenance"         element={<MaintenanceScreen />}   />
          <Route path="/budget"              element={<BudgetScreen />}        />
          <Route path="/advisor"             element={<AIAdvisoryScreen />}    />
          <Route path="/inventory"           element={<InventoryScreen />}     />
          <Route path="/contents"            element={<ContentsScreen />}      />
          <Route path="/settings"            element={<SettingsScreen />}      />
          <Route path="/vendors"             element={<VendorScreen />}        />
          <Route path="/expiry"              element={<ExpiryManageScreen />}  />
          <Route path="/emergency/:propertyId" element={<EmergencyScreen />}  />
          <Route path="/emergency"           element={<EmergencyScreen />}     />
          <Route path="/well-tests"          element={<WellTestScreen />}      />
          <Route path="/septic-log"          element={<SepticScreen />}        />
          <Route path="/fuel"                element={<FuelScreen />}          />
          <Route path="/tax"                 element={<TaxScreen />}           />
          <Route path="/mortgage"            element={<MortgageScreen />}      />
          <Route path="/utilities"           element={<UtilityScreen />}       />
          <Route path="/calendar"            element={<CalendarScreen />}      />
          <Route path="/insurance"           element={<InsuranceScreen />}     />
          <Route path="/permits"             element={<PermitsScreen />}       />
          <Route path="/checklists"          element={<ChecklistScreen />}     />
          <Route path="/checklists/:runId"          element={<ChecklistRunScreen />}    />
          <Route path="/checklists/:runId/guided"   element={<ChecklistGuidedScreen />} />
          <Route path="/generator"           element={<GeneratorScreen />}     />
          <Route path="/road"                element={<RoadScreen />}          />
          <Route path="/profile"             element={<PropertyProfileScreen />} />
          <Route path="/conflicts"           element={<ConflictResolutionScreen />} />
          <Route path="/equipment/:id"         element={<EquipmentDetailScreen />}   />
          <Route path="/equipment/:id/inspect" element={<InspectionScreen />}        />
          <Route path="/risk-brief"            element={<RiskBriefScreen />}         />
          <Route path="/import"                element={<ImportScreen />}            />
          <Route path="/home-book"             element={<HomeBookScreen />}          />
          <Route path="/sync"                element={<SyncScreen />}              />
          <Route path="/activity"            element={<ActivityScreen />}          />
          <Route path="/map"                 element={<MapScreen />}               />
          <Route path="/search"              element={<SearchScreen />}            />
          <Route path="*"                    element={<Navigate to="/" />}     />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </AppShell>
    </HashRouter>
  )
}

// ── Root: auth gate ──────────────────────────────────────────────────────────

type AuthState = 'checking' | 'callback' | 'authenticated' | 'unauthenticated'

export default function App() {
  const [authState, setAuthState] = useState<AuthState>(() => {
    // If we have ?code= in the URL it's an OAuth callback
    const params = new URLSearchParams(window.location.search)
    if (params.has('code')) return 'callback'
    // Emergency bypass: if cached locally and URL has emergency=true
    const hashVal = window.location.hash
    if (hashVal.includes('/emergency') && hashVal.includes('emergency=true')) {
      const pidMatch = hashVal.match(/\/emergency\/([^/?]+)/)
      const pid = pidMatch?.[1] ?? 'tannerville'
      if (localStorage.getItem(`pm_emergency_${pid}`)) return 'authenticated'
    }
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
