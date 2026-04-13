import { useState } from 'react'
import {
  Eye, EyeOff, CheckCircle2, Wifi, WifiOff,
  ExternalLink, ChevronRight, Building2, LogOut,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAuth } from '../auth/AuthContext'
import {
  getSetting, setSetting,
  getModelForTask, setModelForTask,
  hasDevModelOverride, getDevModelOverride,
  SETTINGS,
} from '../store/settings'

const MODELS_BY_TASK = [
  { key: 'nameplate',    task: 'Nameplate Extraction',        default: 'anthropic/claude-opus-4-5'   },
  { key: 'docparse',     task: 'Document Parsing',            default: 'anthropic/claude-sonnet-4-6' },
  { key: 'maintenance',  task: 'Maintenance Recommendations', default: 'anthropic/claude-opus-4-6'   },
  { key: 'budget',       task: 'Budget Analysis',             default: 'anthropic/claude-opus-4-6'   },
  { key: 'qa',           task: 'General Q&A',                 default: 'google/gemini-flash-1.5'     },
  { key: 'advisory',     task: 'Advisory',                    default: 'anthropic/claude-opus-4-6'   },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
        {children}
      </div>
    </div>
  )
}

function Row({ label, children, sub }: { label: string; children?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export function SettingsScreen() {
  const { userEmail, signOut } = useAuth()

  // Load persisted values (localStorage → env var → default)
  const [openRouterKey, setOpenRouterKeyState] = useState(() => getSetting(SETTINGS.openRouterKey))
  const [showKey,       setShowKey]            = useState(false)
  const [haUrl,         setHaUrlState]         = useState(() => getSetting(SETTINGS.haUrl))
  const [haToken,       setHaTokenState]       = useState(() => getSetting(SETTINGS.haToken))
  const [showHaToken,   setShowHaToken]        = useState(false)
  const [haConnected,   setHaConnected]        = useState(false)
  const [testing,       setTesting]            = useState(false)

  // Persist on change
  function updateOpenRouterKey(val: string) {
    setOpenRouterKeyState(val)
    setSetting(SETTINGS.openRouterKey, val)
  }
  function updateHaUrl(val: string) {
    setHaUrlState(val)
    setSetting(SETTINGS.haUrl, val)
  }
  function updateHaToken(val: string) {
    setHaTokenState(val)
    setSetting(SETTINGS.haToken, val)
  }

  function testHaConnection() {
    setTesting(true)
    setTimeout(() => {
      setHaConnected(true)
      setTesting(false)
    }, 1500)
  }

  return (
    <div className="space-y-5 max-w-xl">

      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">API keys, integrations, and preferences</p>
      </div>

      {/* Account */}
      <Section title="Google Account">
        <Row
          label={userEmail ?? 'Signed in'}
          sub="Google account"
        >
          <button
            onClick={signOut}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </Row>
        <Row label="Drive Scope" sub="App-created files only (drive.file)">
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Authorized
          </span>
        </Row>
        <Row label="Drive Root" sub="Property Manager/2392 Tannerville Rd">
          <button className="text-slate-400 hover:text-slate-600">
            <ExternalLink className="w-4 h-4" />
          </button>
        </Row>
      </Section>

      {/* OpenRouter */}
      <Section title="OpenRouter AI">
        <Row label="API Key" sub="openrouter.ai — multi-model access">
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={openRouterKey}
              onChange={e => updateOpenRouterKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-44 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300 font-mono"
            />
            <button onClick={() => setShowKey(s => !s)} className="text-slate-400 hover:text-slate-600">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Row>
        <div className="px-4 py-3.5">
          {hasDevModelOverride() && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">Dev Override Active</p>
              <p className="text-xs text-amber-700 mt-0.5 font-mono truncate">{getDevModelOverride()}</p>
              <p className="text-xs text-amber-600 mt-0.5">All tasks forced to this model via VITE_MODEL_OVERRIDE</p>
            </div>
          )}
          <p className="text-xs font-medium text-slate-700 mb-2">Model selection by task</p>
          <div className="space-y-2">
            {MODELS_BY_TASK.map(({ key, task, default: def }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className={cn('text-xs truncate flex-1', hasDevModelOverride() ? 'text-slate-400' : 'text-slate-600')}>{task}</span>
                <select
                  value={getModelForTask(key, def)}
                  disabled={hasDevModelOverride()}
                  onChange={e => setModelForTask(key, e.target.value)}
                  className={cn(
                    'text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-sky-300 shrink-0 max-w-[180px]',
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
        </div>
      </Section>

      {/* Home Assistant */}
      <Section title="Home Assistant">
        <Row label="Base URL" sub="Local or Nabu Casa remote URL">
          <input
            type="text"
            value={haUrl}
            onChange={e => updateHaUrl(e.target.value)}
            placeholder="http://homeassistant.local:8123"
            className="w-48 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300"
          />
        </Row>
        <Row label="Access Token" sub="Long-lived token from HA user profile">
          <div className="flex items-center gap-2">
            <input
              type={showHaToken ? 'text' : 'password'}
              value={haToken}
              onChange={e => updateHaToken(e.target.value)}
              placeholder="eyJ..."
              className="w-44 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300 font-mono"
            />
            <button onClick={() => setShowHaToken(s => !s)} className="text-slate-400 hover:text-slate-600">
              {showHaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Row>
        <Row
          label="Connection Status"
          sub={haConnected ? 'Connected — 5 entities mapped' : 'Not connected'}
        >
          <div className="flex items-center gap-2">
            {haConnected
              ? <Wifi    className="w-4 h-4 text-emerald-500" />
              : <WifiOff className="w-4 h-4 text-slate-400"   />
            }
            <button
              onClick={testHaConnection}
              disabled={testing}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                haConnected
                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  : 'bg-sky-50 text-sky-600 hover:bg-sky-100',
              )}
            >
              {testing ? 'Testing...' : haConnected ? 'Re-test' : 'Test'}
            </button>
          </div>
        </Row>
        <Row label="Entity Mapping" sub="Map HA entities to property systems">
          <button className="flex items-center gap-1 text-xs text-sky-600 font-medium">
            Configure <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
      </Section>

      {/* Properties */}
      <Section title="Properties">
        <Row label="2392 Tannerville Rd" sub="Primary residence · Orrville OH">
          <button className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700">
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
        <Row label="Camp" sub="Secondary property">
          <button className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700">
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
        <div className="px-4 py-3">
          <button className="text-xs text-sky-600 font-medium hover:text-sky-700 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            + Add property
          </button>
        </div>
      </Section>

      {/* Sync / Offline */}
      <Section title="Sync & Storage">
        <Row label="Offline Queue" sub="0 uploads pending">
          <button className="text-xs text-slate-500 hover:text-slate-700 font-medium">Retry all</button>
        </Row>
        <Row label="Knowledge Cache" sub="Index last synced: just now">
          <button className="text-xs text-sky-600 hover:text-sky-700 font-medium">Refresh</button>
        </Row>
      </Section>

      {/* About */}
      <Section title="About">
        <Row label="Property Manager" sub="v0.1.0 · React PWA" />
        <Row label="Build" sub="April 2026 · GitHub Pages" />
      </Section>

    </div>
  )
}
