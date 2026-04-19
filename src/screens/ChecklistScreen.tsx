import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Leaf, Sun, CloudSnow, Flame,
  CheckCircle2, Clock, Play, RotateCcw, ChevronRight,
  ClipboardList,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'
import {
  getActiveRun,
  getLastCompletedRun,
  getAllCompletedRuns,
  startRun,
} from '../lib/checklistStore'
import { useAppStore } from '../store/AppStoreContext'
import { PROPERTIES } from '../data/mockData'
import type { Season } from '../types/checklist'

// ── Season helpers ───────────────────────────────────────────────────────────

export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1 // 1-12
  if (month >= 3 && month <= 5)  return 'spring'
  if (month >= 6 && month <= 8)  return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

const SEASON_META: Record<
  Season,
  {
    label: string
    Icon: React.ComponentType<{ className?: string }>
    cardBg: string
    iconBg: string
    iconColor: string
    badgeColor: string
    borderColor: string
    activeBorder: string
  }
> = {
  spring: {
    label: 'Spring',
    Icon: Leaf,
    cardBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    borderColor: 'border-emerald-100 dark:border-emerald-900/50',
    activeBorder: 'border-emerald-400 ring-1 ring-emerald-300 dark:border-emerald-500 dark:ring-emerald-700',
  },
  summer: {
    label: 'Summer',
    Icon: Sun,
    cardBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    borderColor: 'border-amber-100 dark:border-amber-900/50',
    activeBorder: 'border-amber-400 ring-1 ring-amber-300 dark:border-amber-500 dark:ring-amber-700',
  },
  fall: {
    label: 'Fall',
    Icon: Flame,
    cardBg: 'bg-orange-50 dark:bg-orange-950/30',
    iconBg: 'bg-orange-100 dark:bg-orange-900/40',
    iconColor: 'text-orange-600 dark:text-orange-400',
    badgeColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    borderColor: 'border-orange-100 dark:border-orange-900/50',
    activeBorder: 'border-orange-400 ring-1 ring-orange-300 dark:border-orange-500 dark:ring-orange-700',
  },
  winter: {
    label: 'Winter',
    Icon: CloudSnow,
    cardBg: 'bg-sky-50 dark:bg-sky-950/30',
    iconBg: 'bg-sky-100 dark:bg-sky-900/40',
    iconColor: 'text-sky-600 dark:text-sky-400',
    badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    borderColor: 'border-sky-100 dark:border-sky-900/50',
    activeBorder: 'border-sky-400 ring-1 ring-sky-300 dark:border-sky-500 dark:ring-sky-700',
  },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Season Card ──────────────────────────────────────────────────────────────

function SeasonCard({
  templateId,
  propertyId,
  propertyType,
  isCurrent,
}: {
  templateId: string
  propertyId: string
  propertyType: 'residence' | 'camp' | 'land'
  isCurrent: boolean
}) {
  const navigate = useNavigate()
  const template = CHECKLIST_TEMPLATES.find(t => t.id === templateId)!
  const meta = SEASON_META[template.season]
  const { Icon } = meta

  // Filtered item count for this property type
  const itemCount = template.items.filter(i =>
    i.applicableTo.includes(propertyType),
  ).length

  const activeRun  = getActiveRun(propertyId, templateId)
  const lastDone   = getLastCompletedRun(propertyId, templateId)

  // Determine status
  type Status = 'not_started' | 'in_progress' | 'completed'
  let status: Status = 'not_started'
  if (activeRun)  status = 'in_progress'
  else if (lastDone && lastDone.year === new Date().getFullYear()) status = 'completed'

  const doneCount = activeRun
    ? activeRun.items.filter(i => i.done || i.skipped).length
    : lastDone?.items.filter(i => i.done || i.skipped).length ?? 0

  const totalCount = activeRun?.items.length ?? lastDone?.items.length ?? itemCount

  function handlePrimary() {
    if (activeRun) {
      navigate(`/checklists/${activeRun.id}`)
    } else {
      const run = startRun(propertyId, templateId, propertyType)
      navigate(`/checklists/${run.id}`)
    }
  }

  function handleStartNew() {
    const run = startRun(propertyId, templateId, propertyType)
    navigate(`/checklists/${run.id}`)
  }

  function handleViewCompleted() {
    if (lastDone) navigate(`/checklists/${lastDone.id}`)
  }

  return (
    <div
      className={cn(
        'border rounded-2xl p-4 shadow-sm transition-all',
        meta.cardBg,
        meta.borderColor,
        isCurrent && meta.activeBorder,
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.iconBg)}>
          <Icon className={cn('w-5 h-5', meta.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{meta.label}</span>
            {isCurrent && (
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', meta.badgeColor)}>
                Current Season
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{template.name}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" />
          {itemCount} items
        </span>
        {status === 'not_started' && (
          <span className="text-slate-400">Not started this year</span>
        )}
        {status === 'in_progress' && (
          <span className="flex items-center gap-1 text-sky-700 font-medium">
            <Clock className="w-3.5 h-3.5" />
            In progress — {doneCount}/{totalCount} done
          </span>
        )}
        {status === 'completed' && (
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed {lastDone?.completedAt ? formatDate(lastDone.completedAt) : ''}
          </span>
        )}
      </div>

      {/* Progress bar for in_progress */}
      {status === 'in_progress' && totalCount > 0 && (
        <div className="mt-2 bg-white/60 dark:bg-slate-700/60 rounded-full h-2">
          <div
            className="bg-sky-500 rounded-full h-2 transition-all"
            style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        {status === 'not_started' && (
          <button
            onClick={handlePrimary}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        )}
        {status === 'in_progress' && (
          <button
            onClick={handlePrimary}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Continue
          </button>
        )}
        {status === 'completed' && (
          <>
            <button
              onClick={handleViewCompleted}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              View
            </button>
            <button
              onClick={handleStartNew}
              className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start New
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Recent Runs list ─────────────────────────────────────────────────────────

function RecentRunsSection() {
  const navigate = useNavigate()
  const recent = getAllCompletedRuns().slice(0, 5)

  if (recent.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        No completed checklists yet. Start a checklist above to get going.
      </div>
    )
  }

  return (
    <div className="card-surface rounded-2xl shadow-sm card-divider">
      {recent.map(run => {
        const meta = SEASON_META[run.season]
        const property = PROPERTIES.find(p => p.id === run.propertyId)
        const doneCount = run.items.filter(i => i.done).length
        const totalCount = run.items.length
        const { Icon } = meta

        return (
          <button
            key={run.id}
            onClick={() => navigate(`/checklists/${run.id}`)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.iconBg)}>
              <Icon className={cn('w-4 h-4', meta.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">
                {meta.label} {run.year}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {property?.shortName ?? run.propertyId} · {doneCount}/{totalCount} items
                {run.completedAt && ` · ${formatDate(run.completedAt)}`}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        )
      })}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

const SEASON_ORDER: Season[] = ['spring', 'summer', 'fall', 'winter']

export function ChecklistScreen() {
  const { activePropertyId } = useAppStore()
  const [, forceUpdate] = useState(0)
  const refresh = useCallback(() => forceUpdate(n => n + 1), [])

  const property = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]
  const currentSeason = getCurrentSeason()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6" onClick={refresh}>
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Seasonal Checklists</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {property.shortName} — {new Date().getFullYear()}
        </p>
      </div>

      {/* Season cards */}
      <div className="space-y-3">
        {SEASON_ORDER.map(season => {
          const template = CHECKLIST_TEMPLATES.find(t => t.season === season)
          if (!template) return null
          return (
            <SeasonCard
              key={season}
              templateId={template.id}
              propertyId={property.id}
              propertyType={property.type}
              isCurrent={season === currentSeason}
            />
          )
        })}
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">
          Recent Completed Runs
        </h2>
        <RecentRunsSection />
      </div>
    </div>
  )
}
