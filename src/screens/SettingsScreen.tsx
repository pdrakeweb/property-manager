import { useState } from 'react'
import {
  Eye, EyeOff, CheckCircle2, Wifi, WifiOff,
  ExternalLink, ChevronRight, Building2, Sun, Moon, Monitor,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useTheme } from '../contexts/ThemeContext'

const MODELS_BY_TASK = [
  { task: 'Nameplate Extraction',        default: 'anthropic/claude-sonnet-4-6' },
  { task: 'Document Parsing',            default: 'anthropic/claude-sonnet-4-6' },
  { task: 'Maintenance Recommendations', default: 'anthropic/claude-opus-4-6'   },
  { task: 'Budget Analysis',             default: 'anthropic/claude-opus-4-6'   },
  { task: 'General Q&A',                 default: 'google/gemini-flash-1.5'      },
  { task: 'Advisory',                    default: 'anthropic/claude-opus-4-6'   },
]

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

export function SettingsScreen() {
  const { theme, setTheme } = useTheme()
  const [openRouterKey, setOpenRouterKey] = useState('sk-or-v1-••••••••••••••••')
  const [showKey,       setShowKey]       = useState(false)
  const [haUrl,         setHaUrl]         = useState('http://homeassistant.local:8123')
  const [haToken,       setHaToken]       = useState('••••••••••••••••')
  const [showHaToken,   setShowHaToken]   = useState(false)
  const [haConnected,   setHaConnected]   = useState(false)
  const [testing,       setTesting]       = useState(false)

  function testHaConnection() {
    setTesting(true)
    setTimeout(() => {
      setHaConnected(true)
      setTesting(false)
    }, 1500)
  }

  const inputClass = 'text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300'

  return (
    <div className="space-y-5 max-w-xl">

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">API keys, integrations, and preferences</p>
      </div>

      {/* Appearance */}
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

      {/* Account */}
      <Section title="Google Account">
        <Row label="Pete Drake" sub="pdrak@gmail.com">
          <button className="text-xs text-red-500 hover:text-red-600 font-medium">Sign out</button>
        </Row>
        <Row label="Drive Scope" sub="Full Drive read/write access">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Authorized
          </span>
        </Row>
        <Row label="Drive Root" sub="Property Manager/2392 Tannerville Rd">
          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
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
              onChange={e => setOpenRouterKey(e.target.value)}
              className={cn(inputClass, 'w-44 font-mono')}
            />
            <button onClick={() => setShowKey(s => !s)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Row>
        <div className="px-4 py-3.5">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Model selection by task</p>
          <div className="space-y-2">
            {MODELS_BY_TASK.map(({ task, default: def }) => (
              <div key={task} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400 truncate flex-1">{task}</span>
                <select
                  defaultValue={def}
                  className={cn(inputClass, 'shrink-0 max-w-[180px]')}
                >
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
            className={cn(inputClass, 'w-48')}
          />
        </Row>
        <Row label="Access Token" sub="Long-lived token from HA user profile">
          <div className="flex items-center gap-2">
            <input
              type={showHaToken ? 'text' : 'password'}
              value={haToken}
              onChange={e => setHaToken(e.target.value)}
              className={cn(inputClass, 'w-44 font-mono')}
            />
            <button onClick={() => setShowHaToken(s => !s)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
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
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                  : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30',
              )}
            >
              {testing ? 'Testing…' : haConnected ? 'Re-test' : 'Test'}
            </button>
          </div>
        </Row>
        <Row label="Entity Mapping" sub="Map HA entities to property systems">
          <button className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            Configure <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
      </Section>

      {/* Properties */}
      <Section title="Properties">
        <Row label="2392 Tannerville Rd" sub="Primary residence · Orrville OH">
          <button className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300">
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
        <Row label="Camp" sub="Secondary property">
          <button className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300">
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        </Row>
        <div className="px-4 py-3">
          <button className="text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            + Add property
          </button>
        </div>
      </Section>

      {/* Sync / Offline */}
      <Section title="Sync & Storage">
        <Row label="Offline Queue" sub="0 uploads pending">
          <button className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium">Retry all</button>
        </Row>
        <Row label="Knowledge Cache" sub="Index last synced: just now">
          <button className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium">Refresh</button>
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
