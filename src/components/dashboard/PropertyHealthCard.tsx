import { useState } from 'react'
import { Building2, TreePine } from 'lucide-react'
import { cn } from '../../utils/cn'
import { getActiveTasks } from '../../lib/maintenanceStore'
import type { Property } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyHealthCardProps {
  property: Property
  onSelect: (propertyId: string) => void
}

// ── Health score ──────────────────────────────────────────────────────────────

function getHealthScore(overdue: number): 'green' | 'yellow' | 'red' {
  if (overdue >= 4) return 'red'
  if (overdue >= 1) return 'yellow'
  return 'green'
}

const HEALTH_PILL: Record<'green' | 'yellow' | 'red', { label: string; cls: string }> = {
  green:  { label: 'Healthy',  cls: 'bg-emerald-100 text-emerald-700' },
  yellow: { label: 'Needs attention', cls: 'bg-amber-100 text-amber-700' },
  red:    { label: 'At risk',  cls: 'bg-red-100 text-red-700' },
}

const PROP_ICONS: Record<string, React.ElementType> = {
  residence: Building2,
  camp:      TreePine,
  land:      Building2,
}

const LS_VISIT_KEY = (propertyId: string) => `pm_last_visit_${propertyId}`

// ── Component ─────────────────────────────────────────────────────────────────

export function PropertyHealthCard({ property, onSelect }: PropertyHealthCardProps) {
  const today   = new Date().toISOString().slice(0, 10)
  const in30    = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  // Force re-render after logging a visit
  const [visitKey, setVisitKey] = useState(0)

  const tasks     = getActiveTasks(property.id)
  const overdue   = tasks.filter(t => t.status === 'overdue').length
  const dueSoon   = tasks.filter(
    t => t.status !== 'overdue' && t.status !== 'completed' && t.dueDate >= today && t.dueDate <= in30,
  ).length

  const score     = getHealthScore(overdue)
  const pill      = HEALTH_PILL[score]

  // Last visit from localStorage
  const lastVisitRaw = localStorage.getItem(LS_VISIT_KEY(property.id))
  const lastVisitText = lastVisitRaw
    ? `Last visit: ${new Date(lastVisitRaw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No visits logged'

  function handleLogVisit(e: React.MouseEvent) {
    e.stopPropagation()
    localStorage.setItem(LS_VISIT_KEY(property.id), new Date().toISOString().slice(0, 10))
    setVisitKey(k => k + 1)
  }

  const Icon = PROP_ICONS[property.type] ?? Building2

  return (
    <div
      key={visitKey}
      onClick={() => onSelect(property.id)}
      className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{property.shortName}</p>
            <p className="text-xs text-slate-400 truncate">{property.address || property.type}</p>
          </div>
        </div>
        {/* Health pill */}
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', pill.cls)}>
          {pill.label}
        </span>
      </div>

      {/* Count row */}
      <div className="flex items-center gap-3 mb-3">
        {overdue > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            {overdue} overdue
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
            0 overdue
          </span>
        )}
        {dueSoon > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
            {dueSoon} due soon
          </span>
        )}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400 truncate">{lastVisitText}</p>
        <button
          onClick={handleLogVisit}
          className="shrink-0 text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors"
        >
          Log Visit Today
        </button>
      </div>
    </div>
  )
}
