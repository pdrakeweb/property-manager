import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { localIndex } from '../lib/localIndex'
import type { SyncStats, IndexRecord } from '../lib/localIndex'
import { syncAll } from '../lib/syncEngine'
import { getValidToken } from '../auth/oauth'
import { PROPERTIES } from '../data/mockData'

export function SyncScreen() {
  const [stats,   setStats]   = useState<SyncStats>(() => localIndex.getSyncStats())
  const [pending, setPending] = useState<IndexRecord[]>(() => localIndex.getPending())
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<string>()
  const [syncErrors, setSyncErrors] = useState<string[]>([])
  const [lastSyncAt, setLastSyncAt] = useState(
    () => localStorage.getItem('pm_last_sync_at') ?? '',
  )

  function refresh() {
    setStats(localIndex.getSyncStats())
    setPending(localIndex.getPending())
  }

  async function syncNow() {
    setSyncing(true)
    setLastResult(undefined)
    setSyncErrors([])
    try {
      const token = await getValidToken()
      if (!token) {
        setLastResult('Not signed in — sync requires a Google account.')
        return
      }
      let uploaded = 0, failed = 0, pulled = 0, pullFailed = 0
      const allErrors: string[] = []
      for (const p of PROPERTIES) {
        const r = await syncAll(token, p.id)
        uploaded   += r.uploaded
        failed     += r.uploadFailed
        pulled     += r.pulled
        pullFailed += r.pullFailed
        allErrors.push(...r.uploadErrors)
      }
      const now = new Date().toISOString()
      localStorage.setItem('pm_last_sync_at', now)
      setLastSyncAt(now)
      setSyncErrors(allErrors)
      const parts = [`↑ ${uploaded} uploaded`, `↓ ${pulled} pulled`]
      if (failed > 0)     parts.push(`${failed} upload error${failed > 1 ? 's' : ''}`)
      if (pullFailed > 0) parts.push(`${pullFailed} pull error${pullFailed > 1 ? 's' : ''}`)
      setLastResult(parts.join(' · '))
    } catch (err) {
      setLastResult(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
      refresh()
    }
  }

  useEffect(() => { refresh() }, [])

  const shown = pending.slice(0, 25)

  return (
    <div className="space-y-5 max-w-xl">

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sync Status</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {lastSyncAt
            ? `Last synced ${new Date(lastSyncAt).toLocaleString()}`
            : 'Not yet synced this session'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'Pending',   value: stats.pending,   hi: stats.pending   > 0, color: 'text-amber-500'  },
          { label: 'Synced',    value: stats.synced,    hi: false,               color: 'text-emerald-600' },
          { label: 'Conflicts', value: stats.conflicts, hi: stats.conflicts > 0, color: 'text-red-500'    },
        ] as const).map(({ label, value, hi, color }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl font-bold ${hi ? color : 'text-slate-700 dark:text-slate-300'}`}>{value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Sync action card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Google Drive Sync</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Upload pending records and pull any new files from Drive
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {lastResult && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">{lastResult}</p>
            {syncErrors.length > 0 && (
              <ul className="space-y-1">
                {syncErrors.map((e, i) => (
                  <li key={i} className="text-xs text-red-500 dark:text-red-400 font-mono break-words">
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Pending list */}
      {shown.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 px-1">
            Waiting to upload ({stats.pending})
          </h2>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
            {shown.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                    {r.type.replace(/_/g, ' ')} · {r.propertyId}
                  </p>
                </div>
              </div>
            ))}
            {stats.pending > 25 && (
              <div className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                …and {stats.pending - 25} more
              </div>
            )}
          </div>
        </div>
      )}

      {stats.conflicts > 0 && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {stats.conflicts} conflict{stats.conflicts > 1 ? 's' : ''} need resolution — go to the Conflicts screen.
        </div>
      )}

      {stats.pending === 0 && stats.synced > 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          All records are synced to Drive.
        </div>
      )}

    </div>
  )
}
