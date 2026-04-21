import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, Trash2, ExternalLink } from 'lucide-react'
import { localIndex } from '../lib/localIndex'
import type { SyncStats, IndexRecord } from '../lib/localIndex'
import { syncAll, syncAuditLog } from '../lib/syncEngine'
import { exportAllMarkdownToDrive, getKnowledgebaseFolderId } from '../lib/markdownExport'
import { getValidToken } from '../auth/oauth'
import { propertyStore } from '../lib/propertyStore'
import { getQueueCount, retryAll } from '../lib/offlineQueue'
import { auditLog } from '../lib/auditLog'
import type { LogEntry } from '../lib/auditLog'

type KbStatus = {
  syncing: boolean
  result: string
  progress: { done: number; total: number } | null
}

export function SyncScreen() {
  const [stats,   setStats]   = useState<SyncStats>(() => localIndex.getSyncStats())
  const [pending, setPending] = useState<IndexRecord[]>(() => localIndex.getPending())
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<string>()
  const [syncErrors, setSyncErrors] = useState<string[]>([])
  const [lastSyncAt, setLastSyncAt] = useState(
    () => localStorage.getItem('pm_last_sync_at') ?? '',
  )
  const [logEntries,  setLogEntries]  = useState<LogEntry[]>(() => auditLog.getRecent(50))
  const [logExpanded, setLogExpanded] = useState(false)

  // Offline queue
  const [queueCount,  setQueueCount]  = useState(() => getQueueCount())
  const [retrying,    setRetrying]    = useState(false)
  const [retryResult, setRetryResult] = useState('')

  // Knowledgebase sync — scope selector + single status
  const properties    = propertyStore.getAll()
  const kbEligible    = properties.filter(p => p.driveRootFolderId)
  const [kbScope, setKbScope]   = useState<string>('all')
  const [kbStatus, setKbStatus] = useState<KbStatus>({ syncing: false, result: '', progress: null })

  const kbScopeProperty = kbScope === 'all' ? null : kbEligible.find(p => p.id === kbScope) ?? null
  const kbFolderId      = kbScopeProperty ? getKnowledgebaseFolderId(kbScopeProperty.id) : null

  function refresh() {
    setStats(localIndex.getSyncStats())
    setPending(localIndex.getPending())
    setQueueCount(getQueueCount())
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
      for (const p of properties) {
        const r = await syncAll(token, p.id)
        uploaded   += r.uploaded
        failed     += r.uploadFailed
        pulled     += r.pulled
        pullFailed += r.pullFailed
        allErrors.push(...r.uploadErrors)
      }
      await syncAuditLog(token)
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
      setLogEntries(auditLog.getRecent(50))
    }
  }

  async function syncKnowledgebase() {
    if (kbStatus.syncing) return
    const targets = kbScope === 'all' ? kbEligible : kbEligible.filter(p => p.id === kbScope)
    if (targets.length === 0) return
    setKbStatus({ syncing: true, result: '', progress: null })
    try {
      const token = await getValidToken()
      if (!token) { setKbStatus({ syncing: false, result: 'Not signed in', progress: null }); return }
      let exported = 0, skipped = 0, failed = 0
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i]
        const result = await exportAllMarkdownToDrive(token, p.id, (done, total) => {
          const label = targets.length > 1 ? `${p.shortName}: ${done}/${total} (${i + 1}/${targets.length})` : `${done}/${total}`
          setKbStatus(s => ({ ...s, progress: { done, total }, result: label }))
        })
        exported += result.exported
        skipped  += result.skipped
        failed   += result.failed
      }
      setKbStatus({
        syncing: false,
        result: `${exported} created${skipped ? `, ${skipped} already up to date` : ''}${failed ? `, ${failed} failed` : ''}`,
        progress: null,
      })
    } catch (err) {
      setKbStatus({ syncing: false, result: `Error: ${err instanceof Error ? err.message : String(err)}`, progress: null })
    }
  }

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

  useEffect(() => { refresh() }, [])

  const shown = pending.slice(0, 25)

  return (
    <div className="space-y-5 max-w-xl">

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cloud Sync</h1>
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

      {/* Drive Sync card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Records</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Upload pending records and pull any new files from Drive
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={syncing || kbStatus.syncing}
            className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-60 transition-colors shrink-0 ${
              stats.pending > 0
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
        {lastResult && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">{lastResult}</p>
            {syncErrors.length > 0 && (
              <ul className="space-y-1">
                {syncErrors.map((e, i) => (
                  <li key={i} className="text-xs text-red-500 dark:text-red-400 font-mono break-words">{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Knowledgebase sync */}
      {kbEligible.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Knowledgebase</p>
                {kbFolderId && (
                  <a
                    href={`https://drive.google.com/drive/folders/${kbFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-green-600 dark:hover:text-green-400"
                    title="Open in Drive"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Write records to Drive as human-readable .md files
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={kbScope}
                onChange={e => setKbScope(e.target.value)}
                disabled={kbStatus.syncing}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-green-300 disabled:opacity-60"
              >
                <option value="all">All properties</option>
                {kbEligible.map(p => (
                  <option key={p.id} value={p.id}>{p.shortName}</option>
                ))}
              </select>
              <button
                onClick={syncKnowledgebase}
                disabled={kbStatus.syncing || syncing}
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-60 transition-colors ${
                  stats.pending > 0
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${kbStatus.syncing ? 'animate-spin' : ''}`} />
                {kbStatus.syncing ? 'Syncing…' : 'Sync'}
              </button>
            </div>
          </div>

          {kbStatus.syncing && kbStatus.progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Writing files…</span>
                <span>{kbStatus.result || `${kbStatus.progress.done} / ${kbStatus.progress.total}`}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: kbStatus.progress.total > 0 ? `${(kbStatus.progress.done / kbStatus.progress.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {kbStatus.result && !kbStatus.syncing && (
            <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
              <p className="text-xs text-slate-600 dark:text-slate-400">{kbStatus.result}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No Drive folders configured. Set a Drive root folder for each property in Settings → Properties to enable knowledgebase sync.
          </p>
        </div>
      )}

      {/* Offline queue */}
      {queueCount > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Offline Queue</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {queueCount} upload{queueCount !== 1 ? 's' : ''} waiting to be retried
              </p>
            </div>
            <div className="flex items-center gap-2">
              {retryResult && <span className="text-xs text-slate-500 dark:text-slate-400">{retryResult}</span>}
              <button
                onClick={handleRetryAll}
                disabled={retrying}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 transition-colors shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Retrying…' : 'Retry all'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending list */}
      {shown.length > 0 && (
        <div>
          <h2 className="section-title mb-2 px-1">
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

      {/* Sync History */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            onClick={() => setLogExpanded(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {logExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Sync History ({logEntries.length})
          </button>
          {logExpanded && (
            <button
              onClick={() => { auditLog.clear(); setLogEntries([]) }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
        {logExpanded && (
          logEntries.length === 0
            ? <p className="text-xs text-slate-400 dark:text-slate-500 px-1">No log entries yet.</p>
            : <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 shadow-sm">
                {logEntries.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2.5 px-3 py-2">
                    <span className={`mt-0.5 shrink-0 text-xs font-semibold uppercase w-10 ${
                      entry.level === 'error' ? 'text-red-500' :
                      entry.level === 'warn'  ? 'text-amber-500' :
                      'text-slate-400 dark:text-slate-500'
                    }`}>{entry.level}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 dark:text-slate-300 break-words">{entry.message}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {entry.action}
                        {entry.propertyId ? ` · ${entry.propertyId}` : ''}
                        {' · '}
                        {new Date(entry.ts).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </div>

    </div>
  )
}
