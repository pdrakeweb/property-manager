import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Leaf, Sun, CloudSnow, Flame,
  CheckCircle2, Clock, Play, RotateCcw, ChevronRight,
  ClipboardList, Sparkles, Loader2, AlertCircle, Plus, Trash2, X,
  Pencil, Wand2, Check, UserCog,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'
import {
  getActiveRun,
  getLastCompletedRun,
  getAllCompletedRuns,
  getResolvedItems,
  startRun,
} from '../lib/checklistStore'
import { getCustomSet } from '../lib/checklistCustomStore'
import {
  getAdhocTemplates,
  deleteAdhocTemplate,
  createManualChecklist,
  addItemToTemplate,
  updateItemInTemplate,
  removeItemFromTemplate,
} from '../lib/checklistTemplateStore'
import {
  generateChecklistAugmentations,
  createAdhocChecklist,
  regenerateAdhocChecklist,
  suggestChecklistChanges,
  applySuggestions,
  ChecklistGenerationError,
} from '../services/checklistGenerator'
import type {
  ChecklistSuggestions,
  SuggestedAddition,
  SuggestedEdit,
} from '../services/checklistGenerator'
import { useAppStore } from '../store/AppStoreContext'

import type { ChecklistItem, ChecklistTemplate, PropertyType, Season } from '../types/checklist'

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
  onChange,
}: {
  templateId: string
  propertyId: string
  propertyType: 'residence' | 'camp' | 'land'
  isCurrent: boolean
  onChange: () => void
}) {
  const navigate = useNavigate()
  const template = CHECKLIST_TEMPLATES.find(t => t.id === templateId)!
  // Seasonal templates always carry a `season`; narrow the optional type here
  // rather than crashing at runtime on an adhoc template passed in by mistake.
  const meta = SEASON_META[template.season ?? 'spring']
  const { Icon } = meta

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Combined item count for this property type (baseline + AI-added)
  const resolvedItems = getResolvedItems(propertyId, templateId, propertyType)
  const itemCount = resolvedItems.length
  const customSet = getCustomSet(propertyId, templateId)
  const aiCount = customSet?.items.length ?? 0

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

  async function handleRegenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      await generateChecklistAugmentations(propertyId, templateId, propertyType)
      onChange()
    } catch (err) {
      const msg = err instanceof ChecklistGenerationError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to generate suggestions'
      setGenError(msg)
    } finally {
      setGenerating(false)
    }
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
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" />
          {itemCount} items
        </span>
        {aiCount > 0 && (
          <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <Sparkles className="w-3.5 h-3.5" />
            {aiCount} AI-added
          </span>
        )}
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
      <div className="mt-3 flex gap-2 flex-wrap">
        {status === 'not_started' && (
          <button
            onClick={handlePrimary}
            className="btn btn-info gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        )}
        {status === 'in_progress' && (
          <button
            onClick={handlePrimary}
            className="btn btn-info gap-1.5"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Continue
          </button>
        )}
        {status === 'completed' && (
          <>
            <button
              onClick={handleViewCompleted}
              className="btn btn-secondary gap-1.5"
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

        {/* AI regenerate — always available */}
        <button
          onClick={handleRegenerate}
          disabled={generating}
          title={
            aiCount > 0
              ? `Regenerate AI suggestions (${aiCount} currently). New run required to pick up changes.`
              : 'Generate AI-tailored suggestions for this property'
          }
          className="flex items-center gap-1.5 border border-violet-200 dark:border-violet-900/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5" />}
          {generating
            ? 'Generating…'
            : aiCount > 0 ? 'Regenerate AI' : 'Generate AI items'}
        </button>
      </div>

      {customSet?.generatedAt && aiCount > 0 && !genError && (
        <p className="mt-2 text-[11px] text-slate-400">
          AI items last generated {formatDate(customSet.generatedAt)}
          {customSet.model ? ` · ${customSet.model}` : ''}
        </p>
      )}
      {genError && (
        <p className="mt-2 flex items-start gap-1 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {genError}
        </p>
      )}
    </div>
  )
}

// ── Item editor modal ────────────────────────────────────────────────────────

function ItemEditor({
  template,
  propertyType,
  onClose,
  onChange,
}: {
  template: ChecklistTemplate
  propertyType: PropertyType
  onClose: () => void
  onChange: () => void
}) {
  const [items, setItems] = useState<ChecklistItem[]>(template.items)
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editDetail, setEditDetail] = useState('')

  function refreshLocal() {
    // Read back what the store now has
    onChange()
  }

  function handleAdd() {
    const label = newLabel.trim()
    if (!label) return
    const updated = addItemToTemplate(
      template.id,
      { label, category: newCategory.trim() || 'Property-Specific' },
      propertyType,
    )
    if (updated) {
      setItems(updated.items)
      setNewLabel('')
      setNewCategory('')
      refreshLocal()
    }
  }

  function beginEdit(item: ChecklistItem) {
    setEditing(item.id)
    setEditLabel(item.label)
    setEditCategory(item.category)
    setEditDetail(item.detail ?? '')
  }

  function commitEdit() {
    if (!editing) return
    const updated = updateItemInTemplate(template.id, editing, {
      label: editLabel.trim(),
      category: editCategory.trim() || 'Property-Specific',
      detail: editDetail.trim() || undefined,
    })
    if (updated) {
      setItems(updated.items)
      refreshLocal()
    }
    setEditing(null)
  }

  function handleRemove(itemId: string) {
    const updated = removeItemFromTemplate(template.id, itemId)
    if (updated) {
      setItems(updated.items)
      refreshLocal()
    }
  }

  // Group by category preserving order.
  const byCategory: [string, ChecklistItem[]][] = []
  for (const item of items) {
    const last = byCategory[byCategory.length - 1]
    if (last && last[0] === item.category) last[1].push(item)
    else byCategory.push([item.category, [item]])
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-900">Edit items — {template.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {template.origin === 'ai' && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 p-3 text-xs text-amber-800 dark:text-amber-200">
              This checklist was AI-generated. Any edit here converts it to a manual checklist —
              the Regenerate button will be replaced with Suggest changes.
            </div>
          )}

          {byCategory.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">No items yet. Add one below.</p>
          )}

          {byCategory.map(([cat, catItems]) => (
            <div key={cat} className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
                {cat}
              </h3>
              {catItems.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
                >
                  {editing === item.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className="input-surface rounded-lg px-2 py-1.5 text-sm w-full"
                        placeholder="Label"
                      />
                      <input
                        type="text"
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value)}
                        className="input-surface rounded-lg px-2 py-1.5 text-xs w-full"
                        placeholder="Category"
                      />
                      <textarea
                        value={editDetail}
                        onChange={e => setEditDetail(e.target.value)}
                        rows={2}
                        className="input-surface rounded-lg px-2 py-1.5 text-xs w-full"
                        placeholder="Detail / hint (optional)"
                      />
                      <div className="flex gap-2">
                        <button onClick={commitEdit} className="btn btn-primary btn-sm gap-1.5">
                          <Check className="w-3.5 h-3.5" /> Save
                        </button>
                        <button onClick={() => setEditing(null)} className="btn btn-secondary btn-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 dark:text-slate-100 leading-snug">
                          {item.label}
                        </div>
                        {item.detail && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {item.detail}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => beginEdit(item)}
                        title="Edit"
                        className="text-slate-400 hover:text-sky-600 p-1"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        title="Remove"
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="border-t border-slate-100 dark:border-slate-700 p-5 space-y-2">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Add item
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              placeholder="Category"
              className="input-surface rounded-lg px-2 py-1.5 text-xs w-32"
            />
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Label"
              className="input-surface rounded-lg px-2 py-1.5 text-sm flex-1"
            />
            <button
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              className="btn btn-primary gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Suggest-changes review modal ─────────────────────────────────────────────

function SuggestionsModal({
  template,
  suggestions,
  onClose,
  onApplied,
}: {
  template: ChecklistTemplate
  suggestions: ChecklistSuggestions
  onClose: () => void
  onApplied: () => void
}) {
  // Track accepted state for each suggestion. Default: all accepted.
  const [acceptedAdd, setAcceptedAdd] = useState<boolean[]>(
    () => suggestions.additions.map(() => true),
  )
  const [acceptedEdit, setAcceptedEdit] = useState<boolean[]>(
    () => suggestions.edits.map(() => true),
  )
  const [acceptedRemove, setAcceptedRemove] = useState<boolean[]>(
    () => suggestions.removals.map(() => true),
  )
  const [busy, setBusy] = useState(false)

  const itemById = new Map(template.items.map(i => [i.id, i]))

  function apply() {
    setBusy(true)
    try {
      const additions: SuggestedAddition[] = suggestions.additions.filter((_, i) => acceptedAdd[i])
      const edits: SuggestedEdit[] = suggestions.edits.filter((_, i) => acceptedEdit[i])
      const removalIds = suggestions.removals.filter((_, i) => acceptedRemove[i]).map(r => r.itemId)
      applySuggestions(template.id, { additions, edits, removalIds })
      onApplied()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const totalChanges =
    acceptedAdd.filter(Boolean).length
    + acceptedEdit.filter(Boolean).length
    + acceptedRemove.filter(Boolean).length

  const nothingSuggested =
    suggestions.additions.length + suggestions.edits.length + suggestions.removals.length === 0

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-bold text-slate-900">
              AI Suggestions — {template.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {nothingSuggested && (
            <div className="text-center py-6">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No changes suggested
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Your checklist looks thorough for this property.
              </p>
            </div>
          )}

          {suggestions.additions.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                + Additions ({suggestions.additions.length})
              </h3>
              <div className="space-y-1.5">
                {suggestions.additions.map((a, i) => (
                  <label
                    key={i}
                    className={cn(
                      'flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
                      acceptedAdd[i]
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedAdd[i]}
                      onChange={e => setAcceptedAdd(s => s.map((v, idx) => idx === i ? e.target.checked : v))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {a.category && (
                          <span className="text-xs text-slate-500 font-normal mr-1">[{a.category}]</span>
                        )}
                        {a.label}
                      </div>
                      {a.detail && <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{a.detail}</div>}
                      {a.rationale && (
                        <div className="text-xs italic text-violet-700 dark:text-violet-400 mt-1">
                          Why: {a.rationale}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {suggestions.edits.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wider mb-2">
                ~ Edits ({suggestions.edits.length})
              </h3>
              <div className="space-y-1.5">
                {suggestions.edits.map((e, i) => {
                  const orig = itemById.get(e.itemId)
                  if (!orig) return null
                  return (
                    <label
                      key={i}
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
                        acceptedEdit[i]
                          ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedEdit[i]}
                        onChange={ev => setAcceptedEdit(s => s.map((v, idx) => idx === i ? ev.target.checked : v))}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-xs text-slate-500 line-through">
                          {orig.label}
                        </div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {e.label ?? orig.label}
                        </div>
                        {(e.detail ?? orig.detail) && (
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {e.detail ?? orig.detail}
                          </div>
                        )}
                        {e.rationale && (
                          <div className="text-xs italic text-violet-700 dark:text-violet-400">
                            Why: {e.rationale}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {suggestions.removals.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-2">
                − Removals ({suggestions.removals.length})
              </h3>
              <div className="space-y-1.5">
                {suggestions.removals.map((r, i) => {
                  const orig = itemById.get(r.itemId)
                  if (!orig) return null
                  return (
                    <label
                      key={i}
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
                        acceptedRemove[i]
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedRemove[i]}
                        onChange={e => setAcceptedRemove(s => s.map((v, idx) => idx === i ? e.target.checked : v))}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 dark:text-slate-100 line-through">
                          {orig.label}
                        </div>
                        {r.rationale && (
                          <div className="text-xs italic text-violet-700 dark:text-violet-400 mt-1">
                            Why: {r.rationale}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} disabled={busy} className="btn btn-secondary flex-1">
            Cancel
          </button>
          {!nothingSuggested && (
            <button
              onClick={apply}
              disabled={busy || totalChanges === 0}
              className="btn btn-primary flex-1 gap-1.5"
            >
              <Check className="w-4 h-4" />
              Apply {totalChanges > 0 ? `${totalChanges} change${totalChanges !== 1 ? 's' : ''}` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Adhoc card ───────────────────────────────────────────────────────────────

function AdhocCard({
  template,
  propertyId,
  propertyType,
  onChange,
}: {
  template: ChecklistTemplate
  propertyId: string
  propertyType: PropertyType
  onChange: () => void
}) {
  const navigate = useNavigate()
  const [regenerating, setRegenerating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<ChecklistSuggestions | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isAI = (template.origin ?? 'ai') === 'ai'
  const active = getActiveRun(propertyId, template.id)
  const lastDone = getLastCompletedRun(propertyId, template.id)

  function handleStart() {
    if (active) {
      navigate(`/checklists/${active.id}`)
    } else {
      const r = startRun(propertyId, template.id, propertyType)
      navigate(`/checklists/${r.id}`)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setErr(null)
    try {
      await regenerateAdhocChecklist(template.id)
      onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleSuggest() {
    setSuggesting(true)
    setErr(null)
    try {
      const s = await suggestChecklistChanges(template.id)
      setSuggestions(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to get suggestions')
    } finally {
      setSuggesting(false)
    }
  }

  function handleDelete() {
    if (!confirm(`Delete "${template.name}"? This removes the template but keeps past runs.`)) return
    deleteAdhocTemplate(template.id)
    onChange()
  }

  const cardBg = isAI ? 'bg-violet-50/60 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900/50'
                      : 'bg-sky-50/60 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/50'
  const iconBg = isAI ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-sky-100 dark:bg-sky-900/40'
  const iconColor = isAI ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400'
  const badgeCls = isAI
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'

  return (
    <div className={cn('rounded-2xl p-4 shadow-sm border', cardBg)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          {isAI
            ? <Sparkles className={cn('w-5 h-5', iconColor)} />
            : <UserCog className={cn('w-5 h-5', iconColor)} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{template.name}</span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', badgeCls)}>
              {isAI ? 'AI-generated' : 'Manual'}
            </span>
          </div>
          {template.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{template.description}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          title="Delete this checklist template"
          className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors p-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" />
          {template.items.length} items
        </span>
        {active && (
          <span className="flex items-center gap-1 text-sky-700 font-medium">
            <Clock className="w-3.5 h-3.5" /> In progress
          </span>
        )}
        {!active && lastDone?.completedAt && (
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Last run {formatDate(lastDone.completedAt)}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        <button onClick={handleStart} className="btn btn-info gap-1.5">
          {active
            ? <><ChevronRight className="w-3.5 h-3.5" />Continue</>
            : <><Play className="w-3.5 h-3.5" />Start</>}
        </button>

        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
          title="Edit items (add, remove, edit)"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit items
        </button>

        {isAI ? (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            title="Regenerate items using the latest property context"
          >
            {regenerating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        ) : (
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="flex items-center gap-1.5 border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            title="Ask AI to review this checklist and propose improvements"
          >
            {suggesting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Wand2 className="w-3.5 h-3.5" />}
            {suggesting ? 'Thinking…' : 'Suggest changes'}
          </button>
        )}
      </div>

      {err && (
        <p className="mt-2 flex items-start gap-1 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {err}
        </p>
      )}

      {showEditor && (
        <ItemEditor
          template={template}
          propertyType={propertyType}
          onClose={() => setShowEditor(false)}
          onChange={onChange}
        />
      )}

      {suggestions && (
        <SuggestionsModal
          template={template}
          suggestions={suggestions}
          onClose={() => setSuggestions(null)}
          onApplied={onChange}
        />
      )}
    </div>
  )
}

// ── New Adhoc Dialog ─────────────────────────────────────────────────────────

function NewAdhocDialog({
  propertyId,
  propertyType,
  onClose,
  onCreated,
}: {
  propertyId: string
  propertyType: PropertyType
  onClose: () => void
  onCreated: () => void
}) {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleCreate() {
    setBusy(true)
    setErr(null)
    try {
      if (mode === 'ai') {
        await createAdhocChecklist({ propertyId, propertyType, name, description })
      } else {
        createManualChecklist({ propertyId, propertyType, name, description, itemsText })
      }
      onCreated()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create checklist')
    } finally {
      setBusy(false)
    }
  }

  const presets: { name: string; description: string }[] = [
    {
      name: 'Storm / Severe Weather Prep',
      description: 'Tasks to complete 24–48 hours before a forecast severe storm (high wind, thunderstorms, hurricane remnants). Focus on securing the property, preparing backup power, and moving vulnerable items indoors.',
    },
    {
      name: 'Extended Absence Prep',
      description: 'Tasks to complete before leaving the property unoccupied for 2+ weeks (vacation, snowbird season). Focus on water, HVAC, security, and anything that could fail silently while away.',
    },
    {
      name: 'Pre-Listing / Sale Prep',
      description: 'Tasks to complete before listing the property for sale. Inspections, repairs, curb appeal, documentation.',
    },
    {
      name: 'Post-Storm Damage Assessment',
      description: 'Walkthrough after a severe weather event to identify damage for insurance and repair prioritization.',
    },
  ]

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card-surface rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            {mode === 'ai'
              ? <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              : <UserCog className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'ai' ? 'New AI Checklist' : 'New Manual Checklist'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 px-5 pt-4">
          <button
            onClick={() => setMode('ai')}
            disabled={busy}
            className={cn(
              'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors',
              mode === 'ai'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700',
            )}
          >
            <Sparkles className="w-4 h-4" /> AI-generated
          </button>
          <button
            onClick={() => setMode('manual')}
            disabled={busy}
            className={cn(
              'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors',
              mode === 'manual'
                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700',
            )}
          >
            <UserCog className="w-4 h-4" /> Manual
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Storm Prep"
              className="input-surface rounded-xl px-3 py-2 text-sm mt-1 w-full"
              disabled={busy}
            />
          </div>

          {mode === 'ai' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  What should this checklist cover?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the scenario or goal. The AI uses this plus your property's equipment and narrative to tailor items."
                  rows={4}
                  className="input-surface rounded-xl px-3 py-2 text-sm mt-1 w-full"
                  disabled={busy}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Or start from a preset
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {presets.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { setName(p.name); setDescription(p.description) }}
                      disabled={busy}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-200 dark:hover:border-violet-800 transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
                      <div className="text-slate-500 line-clamp-2 mt-0.5">{p.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'manual' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Short note about the purpose"
                  className="input-surface rounded-xl px-3 py-2 text-sm mt-1 w-full"
                  disabled={busy}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Items (one per line)
                </label>
                <textarea
                  value={itemsText}
                  onChange={e => setItemsText(e.target.value)}
                  placeholder={'Test generator readiness\nClean gutters\nPut away patio furniture\nPark cars in the garage'}
                  rows={10}
                  className="input-surface rounded-xl px-3 py-2 text-sm mt-1 w-full font-mono"
                  disabled={busy}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Tip: prefix with &quot;Category:&quot; to group — e.g. &quot;Exterior: Clean gutters&quot;.
                  You can edit items and add details after creating.
                </p>
              </div>
            </>
          )}

          {err && (
            <p className="flex items-start gap-1 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {err}
            </p>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={
              busy
              || !name.trim()
              || (mode === 'ai' && !description.trim())
              || (mode === 'manual' && !itemsText.trim())
            }
            className="btn btn-primary flex-1 gap-1.5"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 animate-spin" />{mode === 'ai' ? 'Generating…' : 'Saving…'}</>
              : mode === 'ai'
                ? <><Sparkles className="w-4 h-4" />Generate</>
                : <><Check className="w-4 h-4" />Create</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Recent Runs list ─────────────────────────────────────────────────────────

function RecentRunsSection() {
  const navigate = useNavigate()
  const { properties } = useAppStore()
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
        const meta = run.season ? SEASON_META[run.season] : undefined
        const Icon = meta?.Icon ?? ClipboardList
        const property = properties.find(p => p.id === run.propertyId)
        const doneCount = run.items.filter(i => i.done).length
        const totalCount = run.items.length
        const title = run.kind === 'adhoc'
          ? (run.name ?? 'Ad-hoc')
          : `${meta?.label ?? 'Checklist'} ${run.year}`

        return (
          <button
            key={run.id}
            onClick={() => navigate(`/checklists/${run.id}`)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
          >
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              meta?.iconBg ?? 'bg-violet-100 dark:bg-violet-900/40',
            )}>
              <Icon className={cn('w-4 h-4', meta?.iconColor ?? 'text-violet-600 dark:text-violet-400')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">
                {title}
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
  const { activePropertyId, properties } = useAppStore()
  const [, forceUpdate] = useState(0)
  const refresh = useCallback(() => forceUpdate(n => n + 1), [])
  const [showNewDialog, setShowNewDialog] = useState(false)

  const property = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const currentSeason = getCurrentSeason()
  const adhoc = getAdhocTemplates(property.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6" onClick={refresh}>
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Checklists</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {property.shortName} — {new Date().getFullYear()}
        </p>
      </div>

      {/* Season cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">
          Seasonal
        </h2>
      </div>
      <div className="space-y-3 -mt-2">
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
              onChange={refresh}
            />
          )
        })}
      </div>

      {/* Adhoc section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Ad-hoc
          </h2>
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-violet-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New checklist
          </button>
        </div>
        {adhoc.length === 0 ? (
          <div className="card-surface rounded-2xl p-5 text-center">
            <Sparkles className="w-6 h-6 text-violet-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              No ad-hoc checklists yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Create one for any scenario — storm prep, extended absence, pre-listing, etc.
              The AI tailors items to your property.
            </p>
            <button
              onClick={() => setShowNewDialog(true)}
              className="btn btn-primary gap-1.5 mt-3 mx-auto"
            >
              <Plus className="w-4 h-4" />
              New AI checklist
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {adhoc.map(t => (
              <AdhocCard
                key={t.id}
                template={t}
                propertyId={property.id}
                propertyType={property.type}
                onChange={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">
          Recent Completed Runs
        </h2>
        <RecentRunsSection />
      </div>

      {showNewDialog && (
        <NewAdhocDialog
          propertyId={property.id}
          propertyType={property.type}
          onClose={() => setShowNewDialog(false)}
          onCreated={refresh}
        />
      )}
    </div>
  )
}
