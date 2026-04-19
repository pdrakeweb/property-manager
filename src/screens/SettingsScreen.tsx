import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, CheckCircle2, XCircle, Wifi, WifiOff,
  ExternalLink, ChevronRight, ChevronLeft, Loader2, RefreshCw, Sparkles, Calendar,
  Sun, Moon, Monitor, Trash2, Plus, User, Building2, ScrollText, Info,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useTheme } from '../contexts/ThemeContext'
import { getUserEmail, getUserName, signOut, getValidToken, startOAuthFlow, isDev } from '../auth/oauth'
import { getQueueCount, retryAll } from '../lib/offlineQueue'
import { propertyStore } from '../lib/propertyStore'
import { useAppStore } from '../store/AppStoreContext'
import type { Property, PropertyType } from '../types'
import {
  hasDevModelOverride, getDevModelOverride,
  getModelForTask, setModelForTask,
  setSetting, clearSetting, SETTINGS,
  getOpenRouterKey, getHaUrl, getHaToken,
} from '../store/settings'
import { chatCompletion } from '../services/openRouterClient'
import { exportAllMarkdownToDrive, getKnowledgebaseFolderId } from '../lib/markdownExport'
import { DriveRootInput } from '../components/DriveRootInput'

const MODELS_BY_TASK = [
  { key: 'nameplate',    task: 'Nameplate Extraction',        default: 'anthropic/claude-sonnet-4-6'  },
  { key: 'doc_parsing',  task: 'Document Parsing',            default: 'anthropic/claude-sonnet-4-6'  },
  { key: 'maintenance',  task: 'Maintenance Recommendations', default: 'anthropic/claude-opus-4-6'    },
  { key: 'budget',       task: 'Budget Analysis',             default: 'anthropic/claude-opus-4-6'    },
  { key: 'qa',           task: 'General Q&A',                 default: 'google/gemini-flash-1.5'      },
  { key: 'advisory',     task: 'Advisory',                    default: 'anthropic/claude-opus-4-6'    },
]

type View = 'hub' | 'general' | 'account' | 'ai' | 'ha' | 'properties' | 'sync'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 px-1">{title}</h2>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
        {children}
      </div>
    </div>
  )
}

function Row({ label, children, sub }: { label: string; children?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

interface HubCardProps {
  icon: React.ReactNode
  title: string
  sub: string
  onClick: () => void
  external?: boolean
}

function HubCard({ icon, title, sub, onClick, external }: HubCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
      {external
        ? <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
        : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
      }
    </button>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 mb-4"
    >
      <ChevronLeft className="w-4 h-4" />
      Settings
    </button>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('hub')
  const { theme, setTheme } = useTheme()

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [userEmail] = useState(() => getUserEmail())
  const [userName]  = useState(() => getUserName())

  // ── OpenRouter ──────────────────────────────────────────────────────────────
  const [openRouterKey, setOpenRouterKey] = useState(() => getOpenRouterKey())
  const [showKey, setShowKey] = useState(false)

  function saveOpenRouterKey() {
    if (openRouterKey.trim()) {
      setSetting(SETTINGS.openRouterKey, openRouterKey.trim())
    } else {
      clearSetting(SETTINGS.openRouterKey)
    }
  }

  type ModelTestResult = { model: string; ok: boolean; error?: string }
  const [orTesting, setOrTesting] = useState(false)
  const [orTestResults, setOrTestResults] = useState<ModelTestResult[]>([])

  async function testOpenRouterModels() {
    const key = openRouterKey.trim()
    if (!key) return
    saveOpenRouterKey()
    setOrTesting(true)
    setOrTestResults([])

    const uniqueModels = [...new Set(MODELS_BY_TASK.map(({ key: k, default: def }) => getModelForTask(k, def)))]
    const results: ModelTestResult[] = []

    for (const model of uniqueModels) {
      try {
        await chatCompletion({
          apiKey: key,
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
          maxTokens: 10,
          temperature: 0,
        })
        results.push({ model, ok: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ model, ok: false, error: msg.slice(0, 120) })
      }
      setOrTestResults([...results])
    }

    setOrTesting(false)
  }

  // ── Home Assistant ──────────────────────────────────────────────────────────
  const [haUrl,       setHaUrl]       = useState(() => getHaUrl())
  const [haToken,     setHaToken]     = useState(() => getHaToken())
  const [showHaToken, setShowHaToken] = useState(false)
  const [haConnected, setHaConnected] = useState(false)
  const [haTesting,   setHaTesting]   = useState(false)

  function saveHaSettings() {
    setSetting(SETTINGS.haUrl, haUrl.trim())
    setSetting(SETTINGS.haToken, haToken.trim())
  }

  async function testHaConnection() {
    if (!haUrl.trim() || !haToken.trim()) return
    saveHaSettings()
    setHaTesting(true)
    setHaConnected(false)
    try {
      const resp = await fetch(`${haUrl.trim()}/api/`, {
        headers: { Authorization: `Bearer ${haToken.trim()}`, 'Content-Type': 'application/json' },
      })
      setHaConnected(resp.ok)
    } catch {
      setHaConnected(false)
    } finally {
      setHaTesting(false)
    }
  }

  // ── Offline queue ───────────────────────────────────────────────────────────
  const [queueCount,   setQueueCount]   = useState(() => getQueueCount())
  const [retrying,     setRetrying]     = useState(false)
  const [retryResult,  setRetryResult]  = useState('')

  async function handleRetryAll() {
    setRetrying(true)
    setRetryResult('')
    try {
      const result = await retryAll(getValidToken)
      setQueueCount(getQueueCount())
      setRetryResult(`${result.succeeded} uploaded, ${result.failed} still pending`)
    } catch {
      setRetryResult('Retry failed — check connection')
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    setQueueCount(getQueueCount())
  }, [])

  // ── Calendar ────────────────────────────────────────────────────────────────
  const hasCalendarScope = !!localStorage.getItem('google_access_token') && !isDev()
  const [calReauthing, setCalReauthing] = useState(false)

  async function reauthorizeCalendar() {
    setCalReauthing(true)
    await startOAuthFlow()
  }

  // ── Properties ──────────────────────────────────────────────────────────────
  const { activePropertyId, properties, refreshProperties } = useAppStore()
  const _activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  void _activeProperty  // retained for potential future use

  // ── Knowledgebase sync (per-property) ──────────────────────────────────────
  type KbStatus = { syncing: boolean; result: string; progress: { done: number; total: number } | null; folderId: string | null }
  const [kbByProp, setKbByProp] = useState<Record<string, KbStatus>>({})

  function kb(propId: string): KbStatus {
    return kbByProp[propId] ?? { syncing: false, result: '', progress: null, folderId: getKnowledgebaseFolderId(propId) }
  }
  function setKb(propId: string, update: Partial<KbStatus>) {
    setKbByProp(s => {
      const cur = s[propId] ?? { syncing: false, result: '', progress: null, folderId: getKnowledgebaseFolderId(propId) }
      return { ...s, [propId]: { ...cur, ...update } }
    })
  }

  async function syncKnowledgebase(propId: string) {
    const prop = properties.find(p => p.id === propId)
    if (!prop?.driveRootFolderId || kb(propId).syncing) return
    setKb(propId, { syncing: true, result: '', progress: null })
    try {
      const token = await getValidToken()
      if (!token) { setKb(propId, { syncing: false, result: 'Not signed in' }); return }
      const result = await exportAllMarkdownToDrive(token, propId, (done, total) => {
        setKb(propId, { progress: { done, total } })
      })
      setKb(propId, {
        syncing: false,
        result: `${result.exported} files synced${result.failed ? `, ${result.failed} failed` : ''}`,
        progress: null,
        folderId: result.kbFolderId ?? getKnowledgebaseFolderId(propId),
      })
    } catch (err) {
      setKb(propId, { syncing: false, result: `Error: ${err instanceof Error ? err.message : String(err)}`, progress: null })
    }
  }

  type PropForm = Pick<Property, 'name' | 'shortName' | 'type' | 'address' | 'driveRootFolderId'>
  const emptyForm: PropForm = { name: '', shortName: '', type: 'residence', address: '', driveRootFolderId: '' }

  const [editingProp, setEditingProp] = useState<Property | null>(null)
  const [addingProp,  setAddingProp]  = useState(false)
  const [propForm,    setPropForm]    = useState<PropForm>(emptyForm)

  function openEdit(p: Property) {
    setEditingProp(p)
    setPropForm({ name: p.name, shortName: p.shortName, type: p.type, address: p.address, driveRootFolderId: p.driveRootFolderId })
    setAddingProp(false)
  }

  function openAdd() {
    setEditingProp(null)
    setPropForm(emptyForm)
    setAddingProp(true)
  }

  function saveProp() {
    if (!propForm.name.trim()) return
    const id = editingProp?.id ?? propForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    propertyStore.upsert({
      id,
      name:              propForm.name.trim(),
      shortName:         propForm.shortName.trim() || propForm.name.trim(),
      type:              propForm.type,
      address:           propForm.address.trim(),
      driveRootFolderId: propForm.driveRootFolderId.trim(),
      stats:             editingProp?.stats ?? { documented: 0, total: 0 },
    })
    refreshProperties()
    setEditingProp(null)
    setAddingProp(false)
  }

  function deleteProp(id: string) {
    if (properties.length <= 1) return
    propertyStore.remove(id)
    refreshProperties()
  }

  // ── Sign out ────────────────────────────────────────────────────────────────
  function handleSignOut() {
    signOut()
    window.location.reload()
  }

  // ── Hub ─────────────────────────────────────────────────────────────────────
  if (view === 'hub') {
    return (
      <div className="space-y-5 max-w-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure your app, integrations, and account</p>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
          <HubCard
            icon={<Monitor className="w-5 h-5" />}
            title="General"
            sub="Appearance and theme"
            onClick={() => setView('general')}
          />
          <HubCard
            icon={<User className="w-5 h-5" />}
            title="Google Account"
            sub={userEmail || 'Drive, Calendar, Knowledgebase'}
            onClick={() => setView('account')}
          />
          <HubCard
            icon={<Sparkles className="w-5 h-5" />}
            title="AI"
            sub={openRouterKey ? 'OpenRouter configured' : 'OpenRouter key not set'}
            onClick={() => setView('ai')}
          />
          <HubCard
            icon={<Wifi className="w-5 h-5" />}
            title="Home Assistant"
            sub={haUrl || 'Not configured'}
            onClick={() => setView('ha')}
          />
          <HubCard
            icon={<Building2 className="w-5 h-5" />}
            title="Properties"
            sub={`${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`}
            onClick={() => setView('properties')}
          />
          <HubCard
            icon={<RefreshCw className="w-5 h-5" />}
            title="Sync & Storage"
            sub={queueCount === 0 ? 'No uploads pending' : `${queueCount} upload${queueCount !== 1 ? 's' : ''} pending`}
            onClick={() => setView('sync')}
          />
          <HubCard
            icon={<RefreshCw className="w-5 h-5" />}
            title="Sync History"
            sub="Drive sync log, conflicts, and knowledgebase"
            onClick={() => navigate('/sync')}
            external
          />
          <HubCard
            icon={<ScrollText className="w-5 h-5" />}
            title="Activity Log"
            sub="All user interactions — adds, updates, removals"
            onClick={() => navigate('/activity')}
            external
          />
          <HubCard
            icon={<Info className="w-5 h-5" />}
            title="About"
            sub="Version and build info"
            onClick={() => setView('general')}
          />
        </div>
      </div>
    )
  }

  // ── General ──────────────────────────────────────────────────────────────────
  if (view === 'general') {
    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">General</h1>
        </div>

        <Section title="Appearance">
          <Row label="Theme" sub="Light, dark, or follow system preference">
            <div className="flex gap-1">
              {([
                { id: 'light',  icon: Sun,     label: 'Light'  },
                { id: 'dark',   icon: Moon,    label: 'Dark'   },
                { id: 'system', icon: Monitor, label: 'System' },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors',
                    theme === id
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="About">
          <Row label="Property Manager" sub="v0.1.0 · React PWA + Google Drive" />
          <Row label="Build" sub="April 2026 · GitHub Pages deployment" />
        </Section>
      </div>
    )
  }

  // ── Google Account ───────────────────────────────────────────────────────────
  if (view === 'account') {
    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Google Account</h1>
        </div>

        <Section title="Account">
          <Row
            label={userName || 'Google Account'}
            sub={userEmail || 'Signed in via OAuth'}
          >
            <button onClick={handleSignOut} className="text-xs text-red-500 hover:text-red-600 font-medium shrink-0">
              Sign out
            </button>
          </Row>
          <Row label="Drive Scope" sub="App-created files only (drive.file scope)">
            <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Authorized
            </span>
          </Row>
          <Row
            label="Google Calendar"
            sub={isDev()
              ? 'Dev bypass mode — calendar runs on local mock'
              : hasCalendarScope
                ? 'calendar.events scope authorized'
                : 'Not connected — re-authorize to enable reminders'
            }
          >
            {isDev() ? (
              <span className="text-xs text-amber-600 flex items-center gap-1 shrink-0">
                <Calendar className="w-3.5 h-3.5" />
                Dev mode
              </span>
            ) : hasCalendarScope ? (
              <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : (
              <button
                onClick={reauthorizeCalendar}
                disabled={calReauthing}
                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 shrink-0"
              >
                {calReauthing && <Loader2 className="w-3 h-3 animate-spin" />}
                Connect Calendar
              </button>
            )}
          </Row>
        </Section>

      </div>
    )
  }

  // ── AI ───────────────────────────────────────────────────────────────────────
  if (view === 'ai') {
    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">AI</h1>
        </div>

        <Section title="OpenRouter AI">
          {!openRouterKey && (
            <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-800 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-green-800 dark:text-green-300">AI extraction not configured</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  OpenRouter provides access to Claude, Gemini, and GPT-4o for nameplate extraction and advisory features.
                </p>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:text-green-300 mt-1.5"
                >
                  Get a free API key at openrouter.ai <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
          <Row label="API Key" sub="openrouter.ai — multi-model AI access">
            <div className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={openRouterKey}
                onChange={e => setOpenRouterKey(e.target.value)}
                onBlur={saveOpenRouterKey}
                placeholder="sk-or-v1-…"
                className="w-44 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300 font-mono placeholder:font-sans"
              />
              <button onClick={() => setShowKey(s => !s)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 shrink-0">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Row>
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Required for AI nameplate extraction. Without this, you can still capture photos and fill in equipment details manually.
            </p>
          </div>
          <div className="px-4 py-3.5">
            {hasDevModelOverride() && (
              <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-amber-800">Dev Override Active</p>
                <p className="text-xs text-amber-700 mt-0.5 font-mono truncate">{getDevModelOverride()}</p>
                <p className="text-xs text-amber-600 mt-0.5">All tasks forced to this model via VITE_MODEL_OVERRIDE</p>
              </div>
            )}
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Model selection by task</p>
            <div className="space-y-2">
              {MODELS_BY_TASK.map(({ key, task, default: def }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className={cn('text-xs truncate flex-1', hasDevModelOverride() ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400')}>{task}</span>
                  <select
                    value={getModelForTask(key, def)}
                    disabled={hasDevModelOverride()}
                    onChange={e => setModelForTask(key, e.target.value)}
                    className={cn(
                      'text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-green-300 shrink-0 max-w-[180px]',
                      hasDevModelOverride() && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {hasDevModelOverride() && (
                      <option value={getDevModelOverride()}>{getDevModelOverride()}</option>
                    )}
                    <option value="anthropic/claude-opus-4-6">Claude Opus 4.6</option>
                    <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="anthropic/claude-opus-4-5">Claude Opus 4.5</option>
                    <option value="google/gemini-flash-1.5">Gemini Flash 1.5</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={testOpenRouterModels}
                disabled={orTesting || !openRouterKey.trim()}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 transition-colors"
              >
                {orTesting && <Loader2 className="w-3 h-3 animate-spin" />}
                {orTesting ? 'Testing…' : 'Test models'}
              </button>
              {orTestResults.length > 0 && !orTesting && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {orTestResults.filter(r => r.ok).length}/{orTestResults.length} passed
                </span>
              )}
            </div>
            {orTestResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {orTestResults.map(r => (
                  <div key={r.model} className="flex items-start gap-2">
                    {r.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-px" />
                      : <XCircle     className="w-3.5 h-3.5 text-red-400 shrink-0 mt-px" />
                    }
                    <div className="min-w-0">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate block">{r.model}</span>
                      {!r.ok && r.error && (
                        <span className="text-xs text-red-500 dark:text-red-400 break-words">{r.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>
    )
  }

  // ── Home Assistant ───────────────────────────────────────────────────────────
  if (view === 'ha') {
    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Home Assistant</h1>
        </div>

        <Section title="Connection">
          <Row label="Base URL" sub="Local or Nabu Casa remote URL">
            <input
              type="text"
              value={haUrl}
              onChange={e => setHaUrl(e.target.value)}
              onBlur={saveHaSettings}
              placeholder="http://homeassistant.local:8123"
              className="w-48 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300"
            />
          </Row>
          <Row label="Access Token" sub="Long-lived token from HA user profile">
            <div className="flex items-center gap-2">
              <input
                type={showHaToken ? 'text' : 'password'}
                value={haToken}
                onChange={e => setHaToken(e.target.value)}
                onBlur={saveHaSettings}
                placeholder="eyJ…"
                className="w-44 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300 font-mono placeholder:font-sans"
              />
              <button onClick={() => setShowHaToken(s => !s)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 shrink-0">
                {showHaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Row>
          <Row
            label="Connection Status"
            sub={haConnected ? 'Connected to Home Assistant' : haUrl ? 'Not tested' : 'URL not configured'}
          >
            <div className="flex items-center gap-2">
              {haConnected
                ? <Wifi    className="w-4 h-4 text-emerald-500" />
                : <WifiOff className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              }
              <button
                onClick={testHaConnection}
                disabled={haTesting || !haUrl.trim()}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1',
                  haConnected
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50',
                )}
              >
                {haTesting && <Loader2 className="w-3 h-3 animate-spin" />}
                {haTesting ? 'Testing…' : haConnected ? 'Re-test' : 'Test'}
              </button>
            </div>
          </Row>
          <Row label="Entity Mapping" sub="Map HA entities to property systems">
            <button className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
              Configure <ChevronRight className="w-3 h-3" />
            </button>
          </Row>
        </Section>
      </div>
    )
  }

  // ── Properties ───────────────────────────────────────────────────────────────
  if (view === 'properties') {
    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Properties</h1>
        </div>

        <Section title="Properties">
          {properties.map(p => {
            const kbStatus = kb(p.id)
            return (
              <div key={p.id}>
                <Row
                  label={p.name}
                  sub={`${p.type} · ${p.address || 'No address'} · Drive: ${p.driveRootFolderId ? '✓' : 'not set'}`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1"
                    >
                      Edit <ChevronRight className="w-3 h-3" />
                    </button>
                    {properties.length > 1 && (
                      <button onClick={() => deleteProp(p.id)} className="text-slate-400 hover:text-red-400 ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Row>

                {(editingProp?.id === p.id) && (
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    {([
                      { label: 'Full name',  key: 'name'      },
                      { label: 'Short name', key: 'shortName' },
                      { label: 'Address',    key: 'address'   },
                    ] as { label: string; key: keyof PropForm }[]).map(({ label, key }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</span>
                        <input
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300"
                          value={propForm[key] as string}
                          onChange={e => setPropForm(f => ({ ...f, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0 pt-1.5">Drive folder</span>
                      <DriveRootInput
                        value={propForm.driveRootFolderId}
                        onChange={id => setPropForm(f => ({ ...f, driveRootFolderId: id }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Type</span>
                      <select
                        value={propForm.type}
                        onChange={e => setPropForm(f => ({ ...f, type: e.target.value as PropertyType }))}
                        className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-green-300"
                      >
                        <option value="residence">Residence</option>
                        <option value="camp">Camp</option>
                        <option value="land">Land</option>
                      </select>
                    </div>

                    {/* Knowledgebase sync — only shown when Drive folder is set */}
                    {(propForm.driveRootFolderId || p.driveRootFolderId) && (
                      <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Knowledgebase</span>
                          <div className="flex items-center gap-2">
                            {kbStatus.folderId && (
                              <a
                                href={`https://drive.google.com/drive/folders/${kbStatus.folderId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-green-600 dark:hover:text-green-400"
                                title="Open in Drive"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => syncKnowledgebase(p.id)}
                              disabled={kbStatus.syncing || !p.driveRootFolderId}
                              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 disabled:opacity-40"
                            >
                              {kbStatus.syncing
                                ? <><Loader2 className="w-3 h-3 animate-spin" />{kbStatus.progress ? `${kbStatus.progress.done}/${kbStatus.progress.total}` : 'Syncing…'}</>
                                : <><RefreshCw className="w-3 h-3" />Sync Knowledgebase</>
                              }
                            </button>
                          </div>
                        </div>
                        {kbStatus.result && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{kbStatus.result}</p>
                        )}
                        {!kbStatus.folderId && !kbStatus.syncing && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">Not synced yet — click Sync Knowledgebase to generate markdown files in Drive.</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button onClick={saveProp} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">Save</button>
                      <button onClick={() => setEditingProp(null)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {addingProp ? (
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700 space-y-2">
              {([
                { label: 'Full name',  key: 'name'      },
                { label: 'Short name', key: 'shortName' },
                { label: 'Address',    key: 'address'   },
              ] as { label: string; key: keyof PropForm }[]).map(({ label, key }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</span>
                  <input
                    className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300"
                    value={propForm[key] as string}
                    onChange={e => setPropForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex items-start gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0 pt-1.5">Drive folder</span>
                <DriveRootInput
                  value={propForm.driveRootFolderId}
                  onChange={id => setPropForm(f => ({ ...f, driveRootFolderId: id }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Type</span>
                <select
                  value={propForm.type}
                  onChange={e => setPropForm(f => ({ ...f, type: e.target.value as PropertyType }))}
                  className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-green-300"
                >
                  <option value="residence">Residence</option>
                  <option value="camp">Camp</option>
                  <option value="land">Land</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveProp} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">Add</button>
                <button onClick={() => setAddingProp(false)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <button
                onClick={openAdd}
                className="text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add property
              </button>
            </div>
          )}
        </Section>
      </div>
    )
  }

  // ── Sync & Storage ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-xl">
      <BackButton onBack={() => setView('hub')} />
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sync & Storage</h1>
      </div>

      <Section title="Sync & Storage">
        <Row
          label="Offline Queue"
          sub={queueCount === 0 ? 'No uploads pending' : `${queueCount} upload${queueCount !== 1 ? 's' : ''} waiting`}
        >
          <div className="flex items-center gap-2">
            {retryResult && <span className="text-xs text-slate-500 dark:text-slate-400">{retryResult}</span>}
            <button
              onClick={handleRetryAll}
              disabled={retrying || queueCount === 0}
              className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium disabled:opacity-40 flex items-center gap-1"
            >
              {retrying && <RefreshCw className="w-3 h-3 animate-spin" />}
              Retry all
            </button>
          </div>
        </Row>
        <Row label="Activity Log" sub="View sync history and errors">
          <button
            onClick={() => navigate('/sync')}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300"
          >
            Open <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
      </Section>
    </div>
  )
}
