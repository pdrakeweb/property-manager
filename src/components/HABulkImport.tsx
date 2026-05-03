/**
 * Bulk-import HA entities into the equipment index.
 *
 * Lists every HA entity, marks ones already linked to existing equipment as
 * "Already linked" (read-only), and lets the user check the rest. On import,
 * a minimal equipment record is created per checked entity with `haEntityId`
 * pre-filled and the friendly_name as the title — users can refine fields
 * later in EquipmentDetail.
 *
 * The single category dropdown applies to the entire batch. The user can
 * re-categorize per record later if needed.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Search, Loader2, Wifi, WifiOff, Check } from 'lucide-react'
import { cn } from '../utils/cn'
import { listEntities } from '../lib/haClient'
import { localIndex } from '../lib/localIndex'
import { useModalA11y } from '../lib/focusTrap'
import { useAppStore } from '../store/AppStoreContext'
import { propertyStore } from '../lib/propertyStore'
import { CATEGORIES } from '../data/mockData'
import type { HAEntityState } from '../types'

interface Props {
  onClose:    () => void
  /** Called after a successful import with the count of records created. */
  onImported: (count: number) => void
}

const DOMAIN_FILTERS = [
  { id: '',               label: 'All'     },
  { id: 'sensor',         label: 'Sensor'  },
  { id: 'binary_sensor',  label: 'Binary'  },
  { id: 'switch',         label: 'Switch'  },
  { id: 'climate',        label: 'Climate' },
] as const

export function HABulkImport({ onClose, onImported }: Props) {
  const { activePropertyId } = useAppStore()
  const activeProperty = propertyStore.getById(activePropertyId)
  const propertyCats   = useMemo(
    () => activeProperty
      ? CATEGORIES.filter(c => c.propertyTypes.includes(activeProperty.type))
      : CATEGORIES,
    [activeProperty],
  )

  const [entities,   setEntities]   = useState<HAEntityState[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [search,     setSearch]     = useState('')
  const [domain,     setDomain]     = useState<typeof DOMAIN_FILTERS[number]['id']>('')
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [categoryId, setCategoryId] = useState<string>(propertyCats[0]?.id ?? 'service_record')
  const [importing,  setImporting]  = useState(false)

  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  // ── Already-linked entity ids (read-only) ─────────────────────────────────
  const linkedEntityIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of localIndex.getAll('equipment', activePropertyId)) {
      const eid = (r.data as { haEntityId?: string }).haEntityId
      if (eid) ids.add(eid)
    }
    return ids
  }, [activePropertyId])

  // ── Load entities once on mount ───────────────────────────────────────────
  useEffect(() => {
    listEntities()
      .then(all => {
        setEntities(all)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    return entities.filter(e => {
      if (domain && !e.entity_id.startsWith(`${domain}.`)) return false
      if (search) {
        const q = search.toLowerCase()
        const name = String(e.attributes.friendly_name ?? '').toLowerCase()
        return e.entity_id.toLowerCase().includes(q) || name.includes(q)
      }
      return true
    })
  }, [entities, search, domain])

  function toggle(entityId: string): void {
    if (linkedEntityIds.has(entityId)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return next
    })
  }

  function selectAllVisible(): void {
    setSelected(prev => {
      const next = new Set(prev)
      for (const e of filtered) {
        if (!linkedEntityIds.has(e.entity_id)) next.add(e.entity_id)
      }
      return next
    })
  }

  function clearSelection(): void {
    setSelected(new Set())
  }

  function handleImport(): void {
    if (selected.size === 0 || !activeProperty) return
    setImporting(true)
    const now = new Date().toISOString()
    let created = 0
    for (const ent of entities) {
      if (!selected.has(ent.entity_id)) continue
      if (linkedEntityIds.has(ent.entity_id)) continue   // safety
      const id = `eq_${ent.entity_id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const title = String(ent.attributes.friendly_name ?? ent.entity_id)
      const filename = `equipment_${id}.json`
      localIndex.upsert({
        id,
        type:       'equipment',
        categoryId,
        propertyId: activePropertyId,
        title,
        data: {
          haEntityId:   ent.entity_id,
          values:       {},
          categoryId,
          propertyId:   activePropertyId,
          capturedAt:   now,
          filename,
          rootFolderId: activeProperty.driveRootFolderId,
        },
        syncState: 'pending_upload',
      })
      created += 1
    }
    setImporting(false)
    onImported(created)
    onClose()
  }

  const selectableCount = filtered.filter(e => !linkedEntityIds.has(e.entity_id)).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ha-bulk-import-title"
        className="relative w-full sm:max-w-2xl bg-white dark:bg-slate-800 sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 id="ha-bulk-import-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Bulk Import HA Entities</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Create equipment records for selected entities. Already-linked entities are read-only.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls: search + domain filter + category + select all */}
        <div className="px-4 pt-3 pb-2 space-y-2 shrink-0 border-b border-slate-100 dark:border-slate-700/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entity ID or friendly name…"
              className="w-full pl-9 pr-3 py-2 text-sm input-surface rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {DOMAIN_FILTERS.map(d => (
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
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Import as:</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="text-sm input-surface rounded-lg px-2 py-1.5"
            >
              {propertyCats.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={selectableCount === 0}
              className="ml-auto text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50"
            >
              Select all ({selectableCount})
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
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
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Wifi className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-sm">No entities match</p>
            </div>
          )}
          {!loading && !error && filtered.map(e => {
            const isLinked   = linkedEntityIds.has(e.entity_id)
            const isSelected = selected.has(e.entity_id)
            const friendly   = String(e.attributes.friendly_name ?? e.entity_id)
            const unit       = e.attributes.unit_of_measurement as string | undefined
            return (
              <button
                key={e.entity_id}
                onClick={() => toggle(e.entity_id)}
                disabled={isLinked}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0',
                  isLinked    ? 'opacity-50 cursor-not-allowed'
                  : isSelected ? 'bg-green-50 dark:bg-green-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center',
                  isLinked    ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700'
                  : isSelected ? 'bg-green-600 border-green-600'
                              : 'border-slate-300 dark:border-slate-600',
                )}>
                  {(isSelected || isLinked) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{friendly}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{e.entity_id}</p>
                </div>
                {isLinked ? (
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 shrink-0">Already linked</span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium tabular-nums">
                    {e.state}{unit ? ` ${unit}` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selected.size} selected
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="btn btn-primary"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Import {selected.size > 0 && `(${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
