import { useState, useEffect, useRef } from 'react'
import { X, Search, Loader2, Wifi, WifiOff, Check } from 'lucide-react'
import { cn } from '../utils/cn'
import { listEntities } from '../lib/haClient'
import { useModalA11y } from '../lib/focusTrap'
import type { HAEntityState } from '../types'

const DOMAINS = [
  { id: '',               label: 'All'     },
  { id: 'sensor',        label: 'Sensor'  },
  { id: 'binary_sensor', label: 'Binary'  },
  { id: 'switch',        label: 'Switch'  },
  { id: 'climate',       label: 'Climate' },
  { id: 'input_boolean', label: 'Input'   },
]

interface Props {
  currentEntityId?: string
  onSelect: (entityId: string) => void
  onClose: () => void
}

export function HAEntityBrowser({ currentEntityId, onSelect, onClose }: Props) {
  const [entities,  setEntities]  = useState<HAEntityState[]>([])
  const [search,    setSearch]    = useState('')
  const [domain,    setDomain]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState(currentEntityId ?? '')
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  useEffect(() => {
    // useModalA11y focuses the first focusable; defer search-focus to the
    // next frame so it overrides only when the user hasn't started tabbing.
    queueMicrotask(() => searchRef.current?.focus())
    listEntities()
      .then(all => { setEntities(all); setLoading(false) })
      .catch(e  => { setError(String(e)); setLoading(false) })
  }, [])

  const filtered = entities.filter(e => {
    if (domain && !e.entity_id.startsWith(`${domain}.`)) return false
    if (search) {
      const q = search.toLowerCase()
      const name = String(e.attributes.friendly_name ?? '').toLowerCase()
      return e.entity_id.toLowerCase().includes(q) || name.includes(q)
    }
    return true
  })

  function friendlyName(e: HAEntityState) {
    return String(e.attributes.friendly_name ?? e.entity_id)
  }

  function stateLabel(e: HAEntityState) {
    const unit = e.attributes.unit_of_measurement
    return unit ? `${e.state} ${unit}` : e.state
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ha-browser-title"
        className="relative w-full sm:max-w-lg bg-white dark:bg-slate-800 sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 id="ha-browser-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Link HA Entity</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select an entity from Home Assistant</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entity ID or name…"
              className="w-full pl-9 pr-4 py-2 text-sm input-surface rounded-xl"
            />
          </div>
        </div>

        {/* Domain filter */}
        <div className="px-4 pb-2 flex gap-1.5 flex-wrap shrink-0">
          {DOMAINS.map(d => (
            <button
              key={d.id}
              onClick={() => setDomain(d.id)}
              className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-lg transition-colors',
                domain === d.id
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Entity list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Loading entities…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <WifiOff className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Could not connect to Home Assistant</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{error}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Check the URL and token in Settings → Home Assistant</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Wifi className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-sm">No entities match</p>
            </div>
          )}

          {!loading && !error && filtered.map(e => {
            const isSelected = selected === e.entity_id
            return (
              <button
                key={e.entity_id}
                onClick={() => setSelected(e.entity_id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0',
                  isSelected
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                  isSelected
                    ? 'bg-green-600 border-green-600'
                    : 'border-slate-300 dark:border-slate-600',
                )}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{friendlyName(e)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{e.entity_id}</p>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium tabular-nums">
                  {stateLabel(e)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {selected ? selected : 'No entity selected'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (selected) { onSelect(selected); onClose() } }}
              disabled={!selected}
              className="btn btn-primary"
            >
              Link Entity
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
