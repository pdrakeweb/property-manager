import { useState, useEffect } from 'react'
import {
  Eye, EyeOff, CheckCircle2, Wifi, WifiOff,
  ExternalLink, ChevronRight, Building2, Loader2, RefreshCw,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { getUserEmail, getUserName, signOut, getValidToken } from '../auth/oauth'
import { getQueueCount, retryAll } from '../lib/offlineQueue'
import { PROPERTIES } from '../data/mockData'

const MODELS_BY_TASK = [
  { task: 'Nameplate Extraction',        default: 'anthropic/claude-opus-4-5'    },
  { task: 'Document Parsing',            default: 'anthropic/claude-sonnet-4-6'  },
  { task: 'Maintenance Recommendations', default: 'anthropic/claude-opus-4-6'    },
  { task: 'Budget Analysis',             default: 'anthropic/claude-opus-4-6'    },
  { task: 'General Q&A',                default: 'google/gemini-flash-1.5'       },
  { task: 'Advisory',                    default: 'anthropic/claude-opus-4-6'    },
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
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [userEmail] = useState(() => getUserEmail())
  const [userName]  = useState(() => getUserName())

  // ── OpenRouter ──────────────────────────────────────────────────────────────
  const [openRouterKey, setOpenRouterKey] = useState(
    () => localStorage.getItem('openrouter_api_key') ?? '',
  )
  const [showKey, setShowKey] = useState(false)

  function saveOpenRouterKey() {
    if (openRouterKey.trim()) {
      localStorage.setItem('openrouter_api_key', openRouterKey.trim())
    } else {
      localStorage.removeItem('openrouter_api_key')
    }
  }

  // ── Home Assistant ──────────────────────────────────────────────────────────
  const [haUrl,       setHaUrl]       = useState(() => localStorage.getItem('ha_url')   ?? '')
  const [haToken,     setHaToken]     = useState(() => localStorage.getItem('ha_token')  ?? '')
  const [showHaToken, setShowHaToken] = useState(false)
  const [haConnected, setHaConnected] = useState(false)
  const [haTesting,   setHaTesting]   = useState(false)

  function saveHaSettings() {
    localStorage.setItem('ha_url',   haUrl.trim())
    localStorage.setItem('ha_token', haToken.trim())
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

  // Refresh queue count when screen mounts
  useEffect(() => {
    setQueueCount(getQueueCount())
  }, [])

  // ── Active property (for Drive Root display) ────────────────────────────────
  const activePropertyId = localStorage.getItem('active_property_id') ?? 'tannerville'
  const activeProperty   = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]

  // ── Sign out ────────────────────────────────────────────────────────────────
  function handleSignOut() {
    signOut()
    window.location.reload()
  }

  return (
    <div className="space-y-5 max-w-xl">

      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">API keys, integrations, and preferences</p>
      </div>

      {/* Google Account */}
      <Section title="Google Account">
        <Row
          label={userName || 'Google Account'}
          sub={userEmail || 'Signed in via OAuth'}
        >
          <button onClick={handleSignOut} className="text-xs text-red-500 hover:text-red-600 font-medium shrink-0">
            Sign out
          </button>
        </Row>
        <Row label="Drive Scope" sub="Full Drive read/write access (drive scope)">
          <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Authorized
          </span>
        </Row>
        <Row
          label="Drive Root"
          sub={`${activeProperty.name} · ${activeProperty.driveRootFolderId ? `ID: ${activeProperty.driveRootFolderId.slice(0, 12)}…` : 'Not configured'}`}
        >
          {activeProperty.driveRootFolderId && (
            <a
              href={`https://drive.google.com/drive/folders/${activeProperty.driveRootFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-sky-600 shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </Row>
      </Section>

      {/* OpenRouter */}
      <Section title="OpenRouter AI">
        <Row label="API Key" sub="openrouter.ai — multi-model access">
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={openRouterKey}
              onChange={e => setOpenRouterKey(e.target.value)}
              onBlur={saveOpenRouterKey}
              placeholder="sk-or-v1-…"
              className="w-44 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300 font-mono placeholder:font-sans"
            />
            <button onClick={() => setShowKey(s => !s)} className="text-slate-400 hover:text-slate-600 shrink-0">
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
            onChange={e => setHaUrl(e.target.value)}
            onBlur={saveHaSettings}
            placeholder="http://homeassistant.local:8123"
            className="w-48 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300"
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
              className="w-44 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300 font-mono placeholder:font-sans"
            />
            <button onClick={() => setShowHaToken(s => !s)} className="text-slate-400 hover:text-slate-600 shrink-0">
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
              : <WifiOff className="w-4 h-4 text-slate-400"   />
            }
            <button
              onClick={testHaConnection}
              disabled={haTesting || !haUrl.trim()}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1',
                haConnected
                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  : 'bg-sky-50 text-sky-600 hover:bg-sky-100 disabled:opacity-50',
              )}
            >
              {haTesting && <Loader2 className="w-3 h-3 animate-spin" />}
              {haTesting ? 'Testing…' : haConnected ? 'Re-test' : 'Test'}
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
        {PROPERTIES.map(p => (
          <Row key={p.id} label={p.name} sub={`${p.type} · ${p.address || 'No address'}`}>
            <button className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700">
              Edit <ChevronRight className="w-3 h-3" />
            </button>
          </Row>
        ))}
        <div className="px-4 py-3">
          <button className="text-xs text-sky-600 font-medium hover:text-sky-700 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            + Add property
          </button>
        </div>
      </Section>

      {/* Sync & Storage */}
      <Section title="Sync & Storage">
        <Row
          label="Offline Queue"
          sub={queueCount === 0 ? 'No uploads pending' : `${queueCount} upload${queueCount !== 1 ? 's' : ''} waiting`}
        >
          <div className="flex items-center gap-2">
            {retryResult && <span className="text-xs text-slate-500">{retryResult}</span>}
            <button
              onClick={handleRetryAll}
              disabled={retrying || queueCount === 0}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium disabled:opacity-40 flex items-center gap-1"
            >
              {retrying && <RefreshCw className="w-3 h-3 animate-spin" />}
              Retry all
            </button>
          </div>
        </Row>
        <Row label="Knowledge Cache" sub="Drive index for AI context">
          <button className="text-xs text-sky-600 hover:text-sky-700 font-medium">Refresh</button>
        </Row>
      </Section>

      {/* About */}
      <Section title="About">
        <Row label="Property Manager" sub="v0.1.0 · React PWA + Google Drive" />
        <Row label="Build" sub="April 2026 · GitHub Pages deployment" />
      </Section>

    </div>
  )
}
