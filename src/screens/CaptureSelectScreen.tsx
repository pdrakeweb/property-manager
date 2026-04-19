import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Sparkles } from 'lucide-react'
import { CATEGORIES, PROPERTIES } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'

export function CaptureSelectScreen() {
  const navigate = useNavigate()
  const { activePropertyId } = useAppStore()

  const activeProperty = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]
  const propertyCategories = CATEGORIES.filter(c => c.propertyTypes.includes(activeProperty.type))

  const withRecords    = propertyCategories.filter(c => c.recordCount && c.recordCount > 0)
  const withoutRecords = propertyCategories.filter(c => !c.recordCount || c.recordCount === 0)

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">New Record</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Select what you want to capture. AI extraction is available for camera-enabled categories.
        </p>
      </div>

      {/* Needs documentation */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Needs documentation ({withoutRecords.length})
        </h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
          {withoutRecords.map(cat => (
            <button
              key={cat.id}
              onClick={() => navigate(`/capture/${cat.id}`)}
              className="flex items-center gap-4 w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
            >
              <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                  {cat.hasAIExtraction && (
                    <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-full px-1.5 py-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{cat.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </section>

      {/* Already documented */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Documented — add another record ({withRecords.length})
        </h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
          {withRecords.map(cat => (
            <button
              key={cat.id}
              onClick={() => navigate(`/capture/${cat.id}`)}
              className="flex items-center gap-4 w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
            >
              <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                  {cat.hasAIExtraction && (
                    <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-full px-1.5 py-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {cat.recordCount} record{(cat.recordCount ?? 0) > 1 ? 's' : ''} · {cat.description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
