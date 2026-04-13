import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { CATEGORIES, PROPERTIES } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'
import { getValidToken } from '../auth/oauth'
import { DriveClient } from '../lib/driveClient'
import type { Category } from '../types'

export function CaptureSelectScreen() {
  const navigate = useNavigate()
  const { driveFileCounts, driveCountsLoaded, setDriveFileCount, activePropertyId } = useAppStore()

  const activeProperty = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]

  // Load Drive file counts for any category not yet fetched
  useEffect(() => {
    const rootFolderId = activeProperty.driveRootFolderId
    if (!rootFolderId) return

    async function loadCounts() {
      const token = await getValidToken()
      if (!token) return

      for (const cat of CATEGORIES) {
        if (driveCountsLoaded[cat.id]) continue

        try {
          const folderId = await DriveClient.resolveFolderId(token, cat.id, rootFolderId)
          const files    = await DriveClient.listFiles(token, folderId)
          setDriveFileCount(cat.id, files.length)
        } catch {
          // Non-fatal: fall back to 0 count for this category
          setDriveFileCount(cat.id, 0)
        }
      }
    }

    loadCounts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePropertyId])

  function getCount(cat: Category): number {
    if (driveCountsLoaded[cat.id]) return driveFileCounts[cat.id] ?? 0
    return cat.recordCount ?? 0
  }

  function isLoading(cat: Category): boolean {
    return !driveCountsLoaded[cat.id]
  }

  const withRecords    = CATEGORIES.filter(c => getCount(c) > 0)
  const withoutRecords = CATEGORIES.filter(c => getCount(c) === 0)

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold text-slate-900">New Record</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Select what you want to capture. Counts reflect your Drive — AI extraction available where shown.
        </p>
      </div>

      {/* Needs documentation */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Needs documentation ({withoutRecords.length})
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {withoutRecords.map(cat => (
            <button
              key={cat.id}
              onClick={() => navigate(`/capture/${cat.id}`)}
              className="flex items-center gap-4 w-full px-4 py-3.5 text-left hover:bg-slate-50 transition-colors group"
            >
              <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                  {cat.hasAIExtraction && (
                    <span className="flex items-center gap-0.5 text-xs text-sky-600 bg-sky-50 border border-sky-100 rounded-full px-1.5 py-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{cat.description}</p>
              </div>
              {isLoading(cat)
                ? <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin shrink-0" />
                : <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
              }
            </button>
          ))}
        </div>
      </section>

      {/* Already documented */}
      {withRecords.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Documented — add another record ({withRecords.length})
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
            {withRecords.map(cat => (
              <button
                key={cat.id}
                onClick={() => navigate(`/capture/${cat.id}`)}
                className="flex items-center gap-4 w-full px-4 py-3.5 text-left hover:bg-slate-50 transition-colors group"
              >
                <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                    {cat.hasAIExtraction && (
                      <span className="flex items-center gap-0.5 text-xs text-sky-600 bg-sky-50 border border-sky-100 rounded-full px-1.5 py-0.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isLoading(cat)
                      ? <span className="flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Loading from Drive…</span>
                      : `${getCount(cat)} file${getCount(cat) !== 1 ? 's' : ''} in Drive · ${cat.description}`
                    }
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
