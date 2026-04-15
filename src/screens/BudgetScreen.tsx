import { useState } from 'react'
import { TrendingUp, Plus, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { CAPITAL_ITEMS, SERVICE_RECORDS } from '../data/mockData'
import type { Priority } from '../types'

type Horizon = '1yr' | '3yr' | '10yr'

function priorityConfig(p: Priority) {
  return {
    critical: { label: 'Critical', bar: 'bg-red-500',    badge: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'       },
    high:     { label: 'High',     bar: 'bg-orange-500', badge: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' },
    medium:   { label: 'Medium',   bar: 'bg-amber-400',  badge: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'  },
    low:      { label: 'Low',      bar: 'bg-slate-300 dark:bg-slate-500',  badge: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'  },
  }[p]
}

const CURRENT_YEAR = 2026

// Group capital items by year
function groupByYear(items: typeof CAPITAL_ITEMS, maxYear: number) {
  const grouped: Record<number, typeof CAPITAL_ITEMS> = {}
  items
    .filter(i => i.estimatedYear <= maxYear)
    .forEach(item => {
      if (!grouped[item.estimatedYear]) grouped[item.estimatedYear] = []
      grouped[item.estimatedYear].push(item)
    })
  return grouped
}

function yearTotal(items: typeof CAPITAL_ITEMS) {
  return {
    low:  items.reduce((s, i) => s + i.costLow,  0),
    high: items.reduce((s, i) => s + i.costHigh, 0),
  }
}

// CSS bar chart row for a single year
function YearRow({
  year,
  items,
  maxTotal,
}: {
  year: number
  items: typeof CAPITAL_ITEMS
  maxTotal: number
}) {
  const [expanded, setExpanded] = useState(year === CURRENT_YEAR)
  const total = yearTotal(items)
  const pct   = Math.round(total.high / maxTotal * 100)
  const topPriority = items.some(i => i.priority === 'critical') ? 'critical' :
                      items.some(i => i.priority === 'high')     ? 'high'     :
                      items.some(i => i.priority === 'medium')   ? 'medium'   : 'low'
  const pconf = priorityConfig(topPriority)

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 pt-4 pb-3 text-left"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800 dark:text-slate-200">{year}</span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', pconf.badge)}>
              {pconf.label}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              ${total.low.toLocaleString()}–${total.high.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Bar */}
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pconf.bar)}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {' — tap to '}
          {expanded ? 'collapse' : 'expand'}
        </p>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          {items.map(item => {
            const iconf = priorityConfig(item.priority)
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', iconf.bar)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {item.installYear ? `Installed ${item.installYear} (${item.ageYears} yrs)` : `Planned ${item.estimatedYear}`}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">{item.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    ${item.costLow.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">–${item.costHigh.toLocaleString()}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function BudgetScreen() {
  const [horizon, setHorizon] = useState<Horizon>('3yr')

  const maxYear = horizon === '1yr' ? CURRENT_YEAR : horizon === '3yr' ? CURRENT_YEAR + 2 : CURRENT_YEAR + 9
  const grouped = groupByYear(CAPITAL_ITEMS, maxYear)
  const years   = Object.keys(grouped).map(Number).sort()

  const allItems = CAPITAL_ITEMS.filter(i => i.estimatedYear <= maxYear)
  const totalLow  = allItems.reduce((s, i) => s + i.costLow,  0)
  const totalHigh = allItems.reduce((s, i) => s + i.costHigh, 0)
  const maxYearTotal = Math.max(...years.map(y => yearTotal(grouped[y]).high), 1)

  const annualReserve = Math.round(totalHigh / (maxYear - CURRENT_YEAR + 1) / 12)

  // Historical spend
  const totalHistoricalSpend = SERVICE_RECORDS.reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const annualAvgSpend = Math.round(totalHistoricalSpend / 2) // ~2 years of records

  const horizons: { id: Horizon; label: string }[] = [
    { id: '1yr',  label: '1 Year'  },
    { id: '3yr',  label: '3 Years' },
    { id: '10yr', label: '10 Years'},
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Budget & Capital</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Forecast based on equipment ages and known replacement needs</p>
      </div>

      {/* Horizon selector */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {horizons.map(h => (
          <button
            key={h.id}
            onClick={() => setHorizon(h.id)}
            className={cn(
              'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
              horizon === h.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Est. Total',       value: `$${Math.round(totalLow/1000)}k–$${Math.round(totalHigh/1000)}k`, icon: TrendingUp,    color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'     },
          { label: 'Monthly Reserve',  value: `$${annualReserve}/mo`,                                            icon: CheckCircle2,  color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Items Planned',    value: `${allItems.length}`,                                               icon: AlertTriangle, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20'                        },
          { label: 'Avg Annual Spend', value: `$${annualAvgSpend.toLocaleString()}`,                              icon: Info,          color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', color)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-200 leading-tight">{value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Reserve recommendation banner */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl px-4 py-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">Reserve Recommendation</p>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            Set aside <strong>${annualReserve}/month</strong> to cover the {horizon} capital forecast of{' '}
            ${totalLow.toLocaleString()}–${totalHigh.toLocaleString()}.
            This is AI-estimated — actual costs may vary; get contractor quotes before budgeting firmly.
          </p>
        </div>
      </div>

      {/* Year-by-year breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Year-by-Year</h2>
        <div className="space-y-3">
          {years.map(year => (
            <YearRow
              key={year}
              year={year}
              items={grouped[year]}
              maxTotal={maxYearTotal}
            />
          ))}
          {years.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No capital items in this window</p>
            </div>
          )}
        </div>
      </div>

      {/* Historical Spend */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Historical Spend</h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          {SERVICE_RECORDS.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{r.workDescription}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {r.systemLabel}
                  {r.contractor ? ` · ${r.contractor}` : ''}
                  {' · '}
                  {new Date(r.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              {r.totalCost !== undefined && (
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  ${r.totalCost.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total recorded</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">${totalHistoricalSpend.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Add capital item */}
      <button className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" />
        Add capital item
      </button>

    </div>
  )
}
