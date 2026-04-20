import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, ChevronRight, Search,
  Camera, AlertTriangle, Wifi,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'
import { localIndex } from '../lib/localIndex'

type FilterMode = 'all' | 'documented' | 'missing'

export function InventoryScreen() {
  const navigate    = useNavigate()
  const { activePropertyId, properties } = useAppStore()
  const [filter, setFilter]   = useState<FilterMode>('all')
  const [search, setSearch]   = useState('')

  const activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const propertyCategories = CATEGORIES.filter(c => c.propertyTypes.includes(activeProperty.type))

  // Count documented categories from localIndex (not Drive file counts from mockData)
  const localItems   = localIndex.getAll('equipment', activePropertyId)
  const documented   = propertyCategories.filter(c => localItems.some(r => r.categoryId === c.id)).length
  const total        = propertyCategories.length
  const pct          = total > 0 ? Math.round(documented / total * 100) : 0

  const visibleCategories = propertyCategories.filter(cat => {
    if (filter === 'documented' && !localItems.some(r => r.categoryId === cat.id)) return false
    if (filter === 'missing'    &&  localItems.some(r => r.categoryId === cat.id)) return false
    if (search) {
      const q = search.toLowerCase()
      return cat.label.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Inventory</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {documented} of {total} categories documented
        </p>
      </div>

      {/* Progress card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{pct}%</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Documentation complete</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{documented}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">of {total} systems</p>
          </div>
        </div>
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {total - documented > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            {total - documented} systems still need documentation — these represent knowledge gaps
          </p>
        )}
      </div>

      {/* Search & filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full pl-10 pr-4 py-2.5 text-sm input-surface rounded-xl"
          />
        </div>

        <div className="flex gap-1.5">
          {[
            { id: 'all' as FilterMode,        label: `All (${total})`           },
            { id: 'missing' as FilterMode,    label: `Missing (${total - documented})`  },
            { id: 'documented' as FilterMode, label: `Done (${documented})`     },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                filter === f.id
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category list */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
        {visibleCategories.map(cat => {
          const catRecords = localItems.filter(r => r.categoryId === cat.id)
          const isDone     = catRecords.length > 0

          return (
            <div key={cat.id}>
              {/* Category header row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                {isDone
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  : <Circle       className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
                }
                <span className="text-xl w-7 text-center shrink-0">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-semibold', isDone ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400')}>
                    {cat.label}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{cat.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isDone ? (
                    <button
                      onClick={() => navigate(`/capture/${cat.id}`)}
                      className="text-xs text-green-600 dark:text-green-400 font-medium hover:underline"
                    >
                      + Add
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate(`/capture/${cat.id}`)}
                      className="flex items-center gap-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800 rounded-lg px-2.5 py-1.5 font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <Camera className="w-3 h-3" />
                      Capture
                    </button>
                  )}
                </div>
              </div>

              {/* LocalIndex equipment records — clickable, with HA badge */}
              {catRecords.length > 0 && (
                <div className="ml-16 mr-4 mb-3 space-y-1.5">
                  {catRecords.map(r => {
                    const d = r.data as Record<string, unknown>
                    const haEntityId = d.haEntityId as string | undefined
                    return (
                      <button
                        key={r.id}
                        onClick={() => navigate(`/equipment/${r.id}`)}
                        className="w-full flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{r.title}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {haEntityId ? (
                              <span className="flex items-center gap-1">
                                <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                                {haEntityId}
                              </span>
                            ) : (
                              cat.label
                            )}
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {visibleCategories.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No categories match "{search}"</p>
          </div>
        )}
      </div>

    </div>
  )
}
