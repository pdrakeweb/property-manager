import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Clock, SkipForward, Undo2, CheckSquare,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'
import {
  checklistRunStore,
  updateRunItem,
  completeRun,
} from '../lib/checklistStore'
import type { ChecklistRun, ChecklistRunItem, ChecklistItem } from '../types/checklist'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  runItem,
  isReadOnly,
  onToggleDone,
  onSkip,
  onUndo,
}: {
  item: ChecklistItem
  runItem: ChecklistRunItem
  isReadOnly: boolean
  onToggleDone: () => void
  onSkip: () => void
  onUndo: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const isDone    = runItem.done
  const isSkipped = runItem.skipped
  const isActive  = !isDone && !isSkipped

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isDone    && 'bg-emerald-50 border-emerald-100',
        isSkipped && 'bg-slate-50 border-slate-100',
        isActive  && 'card-surface',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Checkbox */}
        <button
          onClick={!isReadOnly && isActive ? onToggleDone : undefined}
          disabled={isReadOnly || !isActive}
          className={cn(
            'mt-0.5 shrink-0 transition-colors',
            !isReadOnly && isActive && 'cursor-pointer hover:text-emerald-500',
            isDone    && 'text-emerald-500',
            isSkipped && 'text-slate-300',
            isActive  && 'text-slate-300',
          )}
          aria-label={isDone ? 'Mark incomplete' : 'Mark done'}
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5" />
            : <Circle className="w-5 h-5" />
          }
        </button>

        {/* Label + detail */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'text-sm leading-snug',
                isDone    && 'line-through text-slate-400',
                isSkipped && 'line-through text-slate-400',
                isActive  && 'text-slate-800 font-medium',
              )}
            >
              {item.label}
            </span>
            {item.detail && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors ml-1"
                aria-label={expanded ? 'Collapse detail' : 'Expand detail'}
              >
                {expanded
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />
                }
              </button>
            )}
          </div>

          {/* Time estimate */}
          {item.estimatedMinutes != null && isActive && (
            <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <Clock className="w-3 h-3" />
              {formatMinutes(item.estimatedMinutes)}
            </span>
          )}

          {/* Expanded detail */}
          {expanded && item.detail && (
            <p className="mt-2 text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              {item.detail}
            </p>
          )}
        </div>

        {/* Right side actions */}
        <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
          {!isReadOnly && isDone && (
            <button
              onClick={onUndo}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors px-1.5 py-1 rounded-lg hover:bg-slate-100"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          {!isReadOnly && isSkipped && (
            <button
              onClick={onUndo}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors px-1.5 py-1 rounded-lg hover:bg-slate-100"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          {!isReadOnly && isActive && (
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors px-1.5 py-1 rounded-lg hover:bg-slate-100 border border-slate-200"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  items,
  runItems,
  isReadOnly,
  onToggleDone,
  onSkip,
  onUndo,
}: {
  category: string
  items: ChecklistItem[]
  runItems: Map<string, ChecklistRunItem>
  isReadOnly: boolean
  onToggleDone: (itemId: string) => void
  onSkip: (itemId: string) => void
  onUndo: (itemId: string) => void
}) {
  const doneInCategory = items.filter(i => {
    const ri = runItems.get(i.id)
    return ri?.done || ri?.skipped
  }).length

  return (
    <div className="space-y-2">
      {/* Category header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {category}
        </h3>
        <span className="text-xs text-slate-400">
          {doneInCategory}/{items.length}
        </span>
      </div>

      {/* Items */}
      {items.map(item => {
        const runItem = runItems.get(item.id) ?? {
          itemId: item.id,
          done: false,
          skipped: false,
        }
        return (
          <ItemRow
            key={item.id}
            item={item}
            runItem={runItem}
            isReadOnly={isReadOnly}
            onToggleDone={() => onToggleDone(item.id)}
            onSkip={() => onSkip(item.id)}
            onUndo={() => onUndo(item.id)}
          />
        )
      })}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

const SEASON_LABELS: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall:   'Fall',
  winter: 'Winter',
}

export function ChecklistRunScreen() {
  const { runId } = useParams<{ runId: string }>()
  const navigate  = useNavigate()
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  // Load run fresh on each render (tick changes)
  const run: ChecklistRun | undefined = useMemo(
    () => (runId ? checklistRunStore.getById(runId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runId, tick],
  )

  if (!run) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-slate-500 text-sm">Checklist run not found.</p>
        <button
          onClick={() => navigate('/checklists')}
          className="mt-4 text-sky-600 hover:text-sky-700 text-sm font-medium"
        >
          Back to Checklists
        </button>
      </div>
    )
  }

  const template  = CHECKLIST_TEMPLATES.find(t => t.id === run.templateId)
  const isReadOnly = run.completedAt != null

  // Build a map for quick lookup: itemId → runItem
  const runItemMap = useMemo(
    () => new Map(run.items.map(ri => [ri.itemId, ri])),
    [run.items],
  )

  // Only include items that are in this run
  const runItemIds = new Set(run.items.map(ri => ri.itemId))
  const activeItems = (template?.items ?? []).filter(i => runItemIds.has(i.id))

  // Group by category, preserving insertion order
  const categoriesMap = new Map<string, ChecklistItem[]>()
  for (const item of activeItems) {
    const existing = categoriesMap.get(item.category) ?? []
    existing.push(item)
    categoriesMap.set(item.category, existing)
  }

  // Progress stats
  const totalItems   = run.items.length
  const doneItems    = run.items.filter(i => i.done || i.skipped).length
  const progressPct  = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0
  const allResolved  = doneItems === totalItems

  // Estimated minutes remaining (undone, non-skipped items)
  const undoneIds = new Set(
    run.items.filter(i => !i.done && !i.skipped).map(i => i.itemId),
  )
  const estimatedRemaining = activeItems
    .filter(i => undoneIds.has(i.id))
    .reduce((sum, i) => sum + (i.estimatedMinutes ?? 0), 0)

  // ── Handlers ────────────────────────────────────────────────────────────
  // run is guaranteed non-undefined at this point (early return above handles the undefined case)

  function handleToggleDone(itemId: string) {
    const ri = runItemMap.get(itemId)
    if (!ri) return
    if (ri.done) {
      updateRunItem(run!.id, itemId, { done: false, completedAt: undefined })
    } else {
      updateRunItem(run!.id, itemId, {
        done: true,
        skipped: false,
        completedAt: new Date().toISOString(),
      })
    }
    refresh()
  }

  function handleSkip(itemId: string) {
    updateRunItem(run!.id, itemId, { skipped: true, done: false })
    refresh()
  }

  function handleUndo(itemId: string) {
    updateRunItem(run!.id, itemId, {
      done: false,
      skipped: false,
      completedAt: undefined,
    })
    refresh()
  }

  function handleComplete() {
    completeRun(run!.id)
    navigate('/checklists')
  }

  const seasonLabel = SEASON_LABELS[run!.season] ?? run!.season

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Back + header */}
      <div>
        <button
          onClick={() => navigate('/checklists')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          All Checklists
        </button>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {seasonLabel} Checklist — {run.year}
            </h1>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                <CheckSquare className="w-3.5 h-3.5" />
                Completed {run.completedAt
                  ? new Date(run.completedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : ''}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-slate-700">
              {doneItems} / {totalItems}
            </div>
            <div className="text-xs text-slate-400">done</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 bg-slate-200 rounded-full h-2">
          <div
            className={cn(
              'rounded-full h-2 transition-all duration-300',
              allResolved ? 'bg-emerald-500' : 'bg-sky-500',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-400">{progressPct}% complete</span>
          {!isReadOnly && estimatedRemaining > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              ~{formatMinutes(estimatedRemaining)} remaining
            </span>
          )}
        </div>
      </div>

      {/* Category sections */}
      {Array.from(categoriesMap.entries()).map(([category, items]) => (
        <CategorySection
          key={category}
          category={category}
          items={items}
          runItems={runItemMap}
          isReadOnly={isReadOnly}
          onToggleDone={handleToggleDone}
          onSkip={handleSkip}
          onUndo={handleUndo}
        />
      ))}

      {/* Complete button (only if not already completed) */}
      {!isReadOnly && (
        <div className="pt-2 pb-6">
          <button
            onClick={handleComplete}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-colors shadow-sm',
              allResolved
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-sky-600 hover:bg-sky-700 text-white',
            )}
          >
            <CheckSquare className="w-5 h-5" />
            {allResolved ? 'Mark Checklist Complete' : 'Complete Checklist Anyway'}
          </button>
          {!allResolved && (
            <p className="text-xs text-slate-400 text-center mt-2">
              {totalItems - doneItems} items not yet done or skipped
            </p>
          )}
        </div>
      )}
    </div>
  )
}
