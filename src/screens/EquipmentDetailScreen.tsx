import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Link2, Link2Off, Loader2, Wifi, WifiOff, RefreshCw, CloudDownload } from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES } from '../data/mockData'
import { localIndex } from '../lib/localIndex'
import { fetchEntityState } from '../lib/haClient'
import { HAEntityBrowser } from '../components/HAEntityBrowser'
import { useRecordSync } from '../hooks/useRecordSync'
import type { HAEntityState } from '../types'

export function EquipmentDetailScreen() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate     = useNavigate()

  // Background fetch + live updates. `record` updates in-place when remote
  // changes land — we show the latest merged version without a hard reload.
  const { record, isSyncing } = useRecordSync(id)
  const data       = (record?.data ?? {}) as Record<string, unknown>
  const values     = (data.values ?? {}) as Record<string, string>
  const categoryId = (data.categoryId ?? record?.categoryId ?? '') as string
  const category   = CATEGORIES.find(c => c.id === categoryId)

  // haEntityId stored in data directly (not in values). We track whether the
  // user has dirtied this field locally — if so, a remote pull must not
  // overwrite their selection. Only untouched fields pick up remote changes.
  const [haEntityId,  setHaEntityId]  = useState(() => (data.haEntityId as string | undefined) ?? '')
  const dirtyHaRef = useRef(false)
  useEffect(() => {
    if (dirtyHaRef.current) return    // user is editing — keep local value
    const remote = (data.haEntityId as string | undefined) ?? ''
    setHaEntityId(prev => prev === remote ? prev : remote)
  }, [data.haEntityId])

  const [entityState, setEntityState] = useState<HAEntityState | null>(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [showBrowser,  setShowBrowser]  = useState(false)

  // Fetch entity state whenever haEntityId changes
  useEffect(() => {
    if (!haEntityId) { setEntityState(null); return }
    setStateLoading(true)
    fetchEntityState(haEntityId)
      .then(s  => { setEntityState(s); setStateLoading(false) })
      .catch(() => { setEntityState(null); setStateLoading(false) })
  }, [haEntityId])

  function handleEntitySelected(entityId: string) {
    if (!record) return
    dirtyHaRef.current = true
    const updatedData = { ...data, haEntityId: entityId }
    localIndex.upsert({
      ...record,
      data:      updatedData,
      syncState: record.syncState === 'synced' ? 'pending_upload' : record.syncState,
    })
    setHaEntityId(entityId)
    // Once our edit is persisted, further remote pulls for this field should
    // be treated as newer data (local write is now the baseline).
    dirtyHaRef.current = false
  }

  function handleUnlink() {
    if (!record) return
    dirtyHaRef.current = true
    const updatedData = { ...data }
    delete updatedData.haEntityId
    localIndex.upsert({
      ...record,
      data:      updatedData,
      syncState: record.syncState === 'synced' ? 'pending_upload' : record.syncState,
    })
    setHaEntityId('')
    setEntityState(null)
    dirtyHaRef.current = false
  }

  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <p className="text-sm">Equipment record not found</p>
        <button onClick={() => navigate('/inventory')} className="mt-3 text-xs text-green-600 dark:text-green-400 hover:underline">
          Back to Inventory
        </button>
      </div>
    )
  }

  const stateColor = entityState
    ? entityState.state === 'unavailable' || entityState.state === 'unknown'
      ? 'bg-slate-300 dark:bg-slate-600'
      : entityState.state === 'off' || entityState.state === 'false'
        ? 'bg-slate-400 dark:bg-slate-500'
        : 'bg-emerald-400'
    : 'bg-slate-300 dark:bg-slate-600'

  const stateUnit = entityState?.attributes.unit_of_measurement as string | undefined
  const stateDisplay = entityState
    ? stateUnit ? `${entityState.state} ${stateUnit}` : entityState.state
    : null

  const friendlyName = entityState
    ? String(entityState.attributes.friendly_name ?? entityState.entity_id)
    : haEntityId

  // Build field list from values (omit internal keys)
  const SKIP_KEYS = new Set(['categoryId', 'propertyId', 'capturedAt', 'mdContent', 'filename', 'rootFolderId', 'haEntityId'])
  const displayFields = Object.entries(values).filter(([k]) => !SKIP_KEYS.has(k) && k && values[k])

  return (
    <>
      <div className="space-y-5 pb-8">

        {/* Back nav */}
        <button
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors -ml-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Inventory
        </button>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            {category && <span className="text-2xl">{category.icon}</span>}
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{record.title}</h1>
            {isSyncing && (
              <span
                title="Checking Drive for updates…"
                className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"
              >
                <CloudDownload className="w-3.5 h-3.5 animate-pulse" />
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{category?.label ?? categoryId}</p>
        </div>

        {/* HA Entity section */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span className="w-5 h-5 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-xs">🏠</span>
              Home Assistant
            </h2>
            {haEntityId && (
              <button
                onClick={() => setShowBrowser(true)}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition-colors"
              >
                Change
              </button>
            )}
          </div>

          {haEntityId ? (
            <div className="space-y-3">
              {/* Entity state badge */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5">
                {stateLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
                ) : (
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', stateColor)} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{friendlyName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{haEntityId}</p>
                </div>
                {stateDisplay && (
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 tabular-nums">
                    {stateDisplay}
                  </span>
                )}
                {!stateLoading && !entityState && (
                  <WifiOff className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setStateLoading(true)
                    fetchEntityState(haEntityId)
                      .then(s => { setEntityState(s); setStateLoading(false) })
                      .catch(() => setStateLoading(false))
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh state
                </button>
                <span className="text-slate-200 dark:text-slate-700">·</span>
                <button
                  onClick={handleUnlink}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                >
                  <Link2Off className="w-3 h-3" />
                  Unlink
                </button>
              </div>

              {entityState && (
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  Updated {new Date(entityState.last_updated).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}

              {!entityState && !stateLoading && (
                <div className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
                  <Wifi className="w-3 h-3" />
                  State unavailable — check HA connection in Settings
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Link this equipment to a Home Assistant entity to see its live state
              </p>
              <button
                onClick={() => setShowBrowser(true)}
                className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors mx-auto"
              >
                <Link2 className="w-4 h-4" />
                Link to HA Entity
              </button>
            </div>
          )}
        </div>

        {/* Equipment fields */}
        {displayFields.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Details</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayFields.map(([key, val]) => (
                <div key={key} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-xs text-slate-400 dark:text-slate-500 capitalize w-32 shrink-0 pt-0.5">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-200 flex-1 min-w-0 break-words">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-slate-400 dark:text-slate-500 space-y-1 px-1">
          {(data.capturedAt as string | undefined) && (
            <p>Captured {new Date(data.capturedAt as string).toLocaleDateString()}</p>
          )}
          <p>Sync: <span className="font-medium">{record.syncState}</span></p>
        </div>

      </div>

      {showBrowser && (
        <HAEntityBrowser
          currentEntityId={haEntityId || undefined}
          onSelect={handleEntitySelected}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  )
}
