import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Sparkles } from 'lucide-react'
import { CATEGORIES } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'
import { localIndex } from '../lib/localIndex'
import type { Category } from '../types'

export function CaptureSelectScreen() {
  const navigate = useNavigate()
  const { activePropertyId } = useAppStore()

  function getCount(cat: Category): number {
    // Local index is the source of truth — works offline, no Drive polling needed.
    // Fall back to mock seed value if index hasn't been populated yet.
    const indexed = localIndex.getCount('equipment', activePropertyId)
    if (indexed > 0) {
      // Count per-category from index
      return localIndex.getAll('equipment', activePropertyId)
        .filter(r => r.categoryId === cat.id).length
    }
    return cat.recordCount ?? 0
  }

  const withRecords    = CATEGORIES.filter(c => getCount(c) > 0)
  const withoutRecords = CATEGORIES.filter(c => getCount(c) === 0)

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold text-slate-900">New Record</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Select what you want to capture. Counts are from your local index — AI extraction available where shown.
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
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
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
                    {`${getCount(cat)} record${getCount(cat) !== 1 ? 's' : ''} · ${cat.description}`}
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
