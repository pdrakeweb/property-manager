import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, CheckCircle2, XCircle, Wifi, WifiOff,
  ExternalLink, ChevronRight, ChevronLeft, Loader2, RefreshCw, Sparkles, Calendar,
  Sun, Moon, Monitor, Trash2, Plus, User, Building2, ScrollText, Info,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useTheme } from '../contexts/ThemeContext'
import { getUserEmail, getUserName, signOut, getValidToken, startOAuthFlow, isDev } from '../auth/oauth'
import { getQueueCount } from '../lib/offlineQueue'
import { propertyStore } from '../lib/propertyStore'
import { useAppStore } from '../store/AppStoreContext'
import { useModalA11y } from '../lib/focusTrap'
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
import { HABulkImport } from '../components/HABulkImport'

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
      <h2 className="section-title mb-2 px-1">{title}</h2>
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
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkImportToast, setBulkImportToast] = useState<string | null>(null)

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
  const [queueCount] = useState(() => getQueueCount())

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
    // Use form value if this property is being edited and form has a drive root
    const effectiveRoot = (editingProp?.id === propId ? propForm.driveRootFolderId : '') || prop?.driveRootFolderId
    if (!effectiveRoot || kb(propId).syncing) return

    // If form has an unsaved drive root, persist it first so exportAllMarkdownToDrive can read it
    if (prop && effectiveRoot !== prop.driveRootFolderId) {
      propertyStore.upsert({ ...prop, driveRootFolderId: effectiveRoot })
      refreshProperties()
    }

    setKb(propId, { syncing: true, result: '', progress: null })
    try {
      const token = await getValidToken()
      if (!token) { setKb(propId, { syncing: false, result: 'Not signed in' }); return }
      const result = await exportAllMarkdownToDrive(token, propId, (done, total) => {
        setKb(propId, { progress: { done, total } })
      })
      setKb(propId, {
        syncing: false,
        result: `${result.exported} created${result.skipped ? `, ${result.skipped} already up to date` : ''}${result.failed ? `, ${result.failed} failed` : ''}`,
        progress: null,
        folderId: result.kbFolderId ?? getKnowledgebaseFolderId(propId),
      })
    } catch (err) {
      setKb(propId, { syncing: false, result: `Error: ${err instanceof Error ? err.message : String(err)}`, progress: null })
    }
  }

  type PropForm = {
    name: string
    shortName: string
    type: PropertyType
    address: string
    driveRootFolderId: string
    latitude: string
    longitude: string
    acreage: string
    yearBuilt: string
  }
  const emptyForm: PropForm = {
    name: '', shortName: '', type: 'residence', address: '', driveRootFolderId: '',
    latitude: '', longitude: '', acreage: '', yearBuilt: '',
  }

  const [editingProp, setEditingProp] = useState<Property | null>(null)
  const [addingProp,  setAddingProp]  = useState(false)
  const [propForm,    setPropForm]    = useState<PropForm>(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState<Property | null>(null)

  function openEdit(p: Property) {
    setEditingProp(p)
    setPropForm({
      name:              p.name,
      shortName:         p.shortName,
      type:              p.type,
      address:           p.address,
      driveRootFolderId: p.driveRootFolderId,
      latitude:          p.latitude  != null ? String(p.latitude)  : '',
      longitude:         p.longitude != null ? String(p.longitude) : '',
      acreage:           p.acreage   != null ? String(p.acreage)   : '',
      yearBuilt:         p.yearBuilt != null ? String(p.yearBuilt) : '',
    })
    setAddingProp(false)
  }

  function openAdd() {
    setEditingProp(null)
    setPropForm(emptyForm)
    setAddingProp(true)
  }

  function closeModal() {
    setEditingProp(null)
    setAddingProp(false)
  }

  function saveProp() {
    if (!propForm.name.trim()) return
    const id = editingProp?.id ?? propForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    const numOrUndef = (s: string): number | undefined => {
      const n = Number(s)
      return s.trim() === '' || Number.isNaN(n) ? undefined : n
    }
    propertyStore.upsert({
      id,
      name:              propForm.name.trim(),
      shortName:         propForm.shortName.trim() || propForm.name.trim(),
      type:              propForm.type,
      address:           propForm.address.trim(),
      driveRootFolderId: propForm.driveRootFolderId.trim(),
      stats:             editingProp?.stats ?? { documented: 0, total: 0 },
      latitude:          numOrUndef(propForm.latitude),
      longitude:         numOrUndef(propForm.longitude),
      acreage:           numOrUndef(propForm.acreage),
      yearBuilt:         numOrUndef(propForm.yearBuilt),
    })
    refreshProperties()
    closeModal()
  }

  function requestDelete(p: Property) {
    setConfirmDelete(p)
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return
    propertyStore.remove(confirmDelete.id)
    refreshProperties()
    setConfirmDelete(null)
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
            title="Sync"
            sub={queueCount === 0 ? 'Drive sync, knowledgebase, offline queue' : `${queueCount} upload${queueCount !== 1 ? 's' : ''} pending`}
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
          <Row label="Bulk import entities" sub="Pick HA entities to create as equipment records">
            <button
              onClick={() => setShowBulkImport(true)}
              disabled={!haUrl.trim() || !haToken.trim()}
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 disabled:hover:text-green-600"
            >
              Open Importer <ChevronRight className="w-3 h-3" />
            </button>
          </Row>
          <Row label="Per-entity mapping" sub="Link or unlink entities one-by-one in Inventory">
            <button
              onClick={() => navigate('/inventory')}
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300"
            >
              Open Inventory <ChevronRight className="w-3 h-3" />
            </button>
          </Row>
        </Section>

        {bulkImportToast && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {bulkImportToast}
          </div>
        )}

        {showBulkImport && (
          <HABulkImport
            onClose={() => setShowBulkImport(false)}
            onImported={count => {
              setBulkImportToast(
                count === 0
                  ? 'No entities were imported.'
                  : `Imported ${count} entit${count === 1 ? 'y' : 'ies'} as equipment records.`,
              )
              setTimeout(() => setBulkImportToast(null), 5000)
            }}
          />
        )}
      </div>
    )
  }

  // ── Properties ───────────────────────────────────────────────────────────────
  if (view === 'properties') {
    const modalOpen = addingProp || editingProp !== null
    const isEditing = editingProp !== null
    const editingKb = editingProp ? kb(editingProp.id) : null

    return (
      <div className="space-y-5 max-w-xl">
        <BackButton onBack={() => setView('hub')} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Properties</h1>
        </div>

        <Section title="Properties">
          {properties.map(p => (
            <Row
              key={p.id}
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
                <button onClick={() => requestDelete(p)} className="text-slate-400 hover:text-red-400 ml-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Row>
          ))}
          <div className="px-4 py-3">
            <button
              onClick={openAdd}
              className="text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add property
            </button>
          </div>
        </Section>

        {/* ── Add / Edit modal ─────────────────────────────────────────── */}
        {modalOpen && (
          <PropertyFormModal
            isEditing={isEditing}
            editingProp={editingProp}
            editingKb={editingKb}
            propForm={propForm}
            setPropForm={setPropForm}
            closeModal={closeModal}
            saveProp={saveProp}
            syncKnowledgebase={syncKnowledgebase}
          />
        )}

        {/* ── Delete confirmation ─────────────────────────────────────── */}
        {confirmDelete && (
          <DeletePropertyModal
            target={confirmDelete}
            onlyProperty={properties.length <= 1}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={confirmDeleteNow}
          />
        )}
      </div>
    )
  }

  // Fallback — should not be reached with hub navigation
  return null
}

// ── Property form modal ──────────────────────────────────────────────────────

type PropFormShape = {
  name: string
  shortName: string
  type: PropertyType
  address: string
  driveRootFolderId: string
  latitude: string
  longitude: string
  acreage: string
  yearBuilt: string
}

type KbStatusShape = { syncing: boolean; result: string; progress: { done: number; total: number } | null; folderId: string | null }

function PropertyFormModal({
  isEditing,
  editingProp,
  editingKb,
  propForm,
  setPropForm,
  closeModal,
  saveProp,
  syncKnowledgebase,
}: {
  isEditing: boolean
  editingProp: Property | null
  editingKb: KbStatusShape | null
  propForm: PropFormShape
  setPropForm: React.Dispatch<React.SetStateAction<PropFormShape>>
  closeModal: () => void
  saveProp: () => void
  syncKnowledgebase: (id: string) => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(closeModal)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={closeModal}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-form-modal-title"
        className="modal-surface w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="property-form-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isEditing ? 'Edit property' : 'Add property'}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          {([
            { label: 'Full name',  key: 'name',      placeholder: '2392 Tannerville Rd' },
            { label: 'Short name', key: 'shortName', placeholder: 'Tannerville' },
            { label: 'Address',    key: 'address',   placeholder: 'Orrville, OH 44667' },
          ] as { label: string; key: keyof PropFormShape; placeholder?: string }[]).map(({ label, key, placeholder }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</span>
              <input
                className="flex-1 text-sm input-surface rounded-lg px-2.5 py-1.5"
                placeholder={placeholder}
                value={propForm[key] as string}
                onChange={e => setPropForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Type</span>
            <select
              value={propForm.type}
              onChange={e => setPropForm(f => ({ ...f, type: e.target.value as PropertyType }))}
              className="text-sm input-surface rounded-lg px-2.5 py-1.5"
            >
              <option value="residence">Residence</option>
              <option value="camp">Camp</option>
              <option value="land">Land</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Latitude</span>
            <input
              type="number"
              step="any"
              placeholder="40.84"
              className="flex-1 text-sm input-surface rounded-lg px-2.5 py-1.5"
              value={propForm.latitude}
              onChange={e => setPropForm(f => ({ ...f, latitude: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Longitude</span>
            <input
              type="number"
              step="any"
              placeholder="-81.76"
              className="flex-1 text-sm input-surface rounded-lg px-2.5 py-1.5"
              value={propForm.longitude}
              onChange={e => setPropForm(f => ({ ...f, longitude: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Acreage</span>
            <input
              type="number"
              step="0.01"
              placeholder="2.5"
              className="flex-1 text-sm input-surface rounded-lg px-2.5 py-1.5"
              value={propForm.acreage}
              onChange={e => setPropForm(f => ({ ...f, acreage: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">Year built</span>
            <input
              type="number"
              placeholder="1998"
              className="flex-1 text-sm input-surface rounded-lg px-2.5 py-1.5"
              value={propForm.yearBuilt}
              onChange={e => setPropForm(f => ({ ...f, yearBuilt: e.target.value }))}
            />
          </div>

          <div className="flex items-start gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0 pt-1.5">Drive folder</span>
            <DriveRootInput
              value={propForm.driveRootFolderId}
              onChange={id => setPropForm(f => ({ ...f, driveRootFolderId: id }))}
            />
          </div>

          {/* Knowledgebase sync — edit mode only, requires a drive root */}
          {isEditing && editingProp && editingKb && (propForm.driveRootFolderId || editingProp.driveRootFolderId) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Knowledgebase</span>
                <div className="flex items-center gap-2">
                  {editingKb.folderId && (
                    <a
                      href={`https://drive.google.com/drive/folders/${editingKb.folderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-green-600 dark:hover:text-green-400"
                      title="Open in Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => syncKnowledgebase(editingProp.id)}
                    disabled={editingKb.syncing || (!editingProp.driveRootFolderId && !propForm.driveRootFolderId)}
                    className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 disabled:opacity-40"
                  >
                    {editingKb.syncing
                      ? <><Loader2 className="w-3 h-3 animate-spin" />{editingKb.progress ? `${editingKb.progress.done}/${editingKb.progress.total}` : 'Syncing…'}</>
                      : <><RefreshCw className="w-3 h-3" />Sync Knowledgebase</>
                    }
                  </button>
                </div>
              </div>
              {editingKb.result && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{editingKb.result}</p>
              )}
              {!editingKb.folderId && !editingKb.syncing && (
                <p className="text-xs text-slate-400 dark:text-slate-500">Not synced yet — click Sync Knowledgebase to generate markdown files in Drive.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={closeModal} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={saveProp} className="btn btn-primary btn-sm">{isEditing ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Delete property modal ────────────────────────────────────────────────────

function DeletePropertyModal({
  target, onlyProperty, onCancel, onConfirm,
}: { target: Property; onlyProperty: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-property-modal-title"
        className="modal-surface w-full max-w-sm rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="delete-property-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Delete property?</h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Remove <strong>{target.name}</strong> and all of its associated records?
          </p>
          {onlyProperty && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              This is your only property. The app will be left with no properties — you'll need to add one before recording any data.
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Local records for this property will remain on disk, but no longer be visible. This action cannot be undone from the UI.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>
  )
}
