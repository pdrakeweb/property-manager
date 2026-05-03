/**
 * Conversation Import (Phase A of CONVERSATION-IMPORT-CONNECTOR-PLAN).
 *
 * Paste or upload a markdown conversation summary and review extracted
 * tasks / purchases / completed work / inventory / notes before
 * committing them to the local index. The fast-path fenced-block
 * parser runs first; if it finds nothing, the LLM fallback runs.
 *
 * Approved items write into:
 *   - tasks      → customTaskStore
 *   - purchases  → capitalItemStore (priority `low`, current year)
 *   - completed  → costStore (CompletedEvent)
 *   - inventory  → toast hint to capture via Inventory (we don't have
 *                  a generic equipment-write path that bypasses the
 *                  capture flow); user can hit "Capture" themselves.
 *   - notes      → narrativeStore.append (free-form notes)
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, Loader2, Sparkles, ChevronDown, ChevronUp, Check,
  Wrench, ShoppingCart, CheckCircle2, ClipboardList, StickyNote, AlertTriangle,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'
import {
  parseConversation, parseFromFencedBlocks, parseWithLlm,
  type ImportPreview, type ImportItem, type ImportTask, type ImportPurchase,
  type ImportCompleted, type ImportNote, type Confidence,
} from '../lib/conversationImport'
import { customTaskStore } from '../lib/maintenanceStore'
import { capitalItemStore } from '../lib/capitalItemStore'
import { costStore } from '../lib/costStore'
import { localIndex } from '../lib/localIndex'
import { getOpenRouterKey } from '../store/settings'
import { useToast } from '../components/Toast'
import type { Priority } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_LABEL = {
  task:       { label: 'Maintenance task', icon: Wrench,         color: 'text-amber-600 dark:text-amber-400'   },
  purchase:   { label: 'Purchase',         icon: ShoppingCart,   color: 'text-sky-600   dark:text-sky-400'     },
  completed:  { label: 'Completed work',   icon: CheckCircle2,   color: 'text-emerald-600 dark:text-emerald-400' },
  inventory:  { label: 'Inventory',        icon: ClipboardList,  color: 'text-slate-600 dark:text-slate-300'   },
  note:       { label: 'Note',             icon: StickyNote,     color: 'text-slate-500 dark:text-slate-400'   },
} as const

function confidenceClass(c: Confidence): string {
  return c === 'high'   ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
       : c === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
       :                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m || !n) return Math.max(m, n)
  const prev = new Array(n + 1).fill(0)
  const curr = new Array(n + 1).fill(0)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

function isProbableDupe(title: string, propertyId: string): boolean {
  const t = title.trim().toLowerCase()
  if (!t) return false
  const existing = localIndex.getAllForProperty(propertyId)
  for (const r of existing) {
    if (r.type !== 'task' && r.type !== 'capital_item' && r.type !== 'completed_event') continue
    const other = (r.title ?? '').trim().toLowerCase()
    if (!other) continue
    if (other === t) return true
    const dist = levenshtein(t, other)
    if (dist <= Math.min(4, Math.max(2, Math.floor(t.length * 0.2)))) return true
  }
  return false
}

// ── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item, idx, approved, dupe, onToggle, onChange,
}: {
  item:     ImportItem
  idx:      number
  approved: boolean
  dupe:     boolean
  onToggle: () => void
  onChange: (next: ImportItem) => void
}) {
  const meta = KIND_LABEL[item.kind]
  const Icon = meta.icon
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'border rounded-2xl shadow-sm overflow-hidden transition-colors',
      approved
        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-60',
    )}>
      <div className="p-3 flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={approved}
          aria-label={approved ? `Skip ${meta.label}` : `Approve ${meta.label}`}
          className={cn(
            'mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0',
            approved
              ? 'bg-green-600 border-green-600 text-white'
              : 'border-slate-300 dark:border-slate-600',
          )}
        >
          {approved && <Check className="w-3 h-3" />}
        </button>
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', meta.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">{item.kind === 'note' ? item.title : item.title}</p>
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', confidenceClass(item.confidence))}>
              {item.confidence}
            </span>
            {dupe && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-2.5 h-2.5" />
                Possible dupe
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.label}</p>

          {(item.rawText || expanded) && (
            <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {item.rawText && (
                <p className="italic text-slate-500 dark:text-slate-400">“{item.rawText}”</p>
              )}
              {expanded && item.kind !== 'note' && (
                <>
                  {item.category && <p><span className="font-medium">Category:</span> {item.category}</p>}
                  {item.kind === 'task' && (
                    <>
                      {item.due && <p><span className="font-medium">Due:</span> {item.due}</p>}
                      {item.priority && <p><span className="font-medium">Priority:</span> {item.priority}</p>}
                      {item.recurrence && <p><span className="font-medium">Recurrence:</span> {item.recurrence}</p>}
                      {item.estimatedCost != null && <p><span className="font-medium">Est cost:</span> ${item.estimatedCost}</p>}
                    </>
                  )}
                  {item.kind === 'purchase' && (
                    <>
                      {item.estimatedCost != null && <p><span className="font-medium">Est cost:</span> ${item.estimatedCost}</p>}
                      {item.vendor && <p><span className="font-medium">Vendor:</span> {item.vendor}</p>}
                    </>
                  )}
                  {item.kind === 'completed' && (
                    <>
                      {item.dateCompleted && <p><span className="font-medium">Completed:</span> {item.dateCompleted}</p>}
                      {item.cost != null && <p><span className="font-medium">Cost:</span> ${item.cost}</p>}
                      {item.contractor && <p><span className="font-medium">Contractor:</span> {item.contractor}</p>}
                    </>
                  )}
                  {item.kind === 'inventory' && (
                    <>
                      {item.brand && <p><span className="font-medium">Brand:</span> {item.brand}</p>}
                      {item.model && <p><span className="font-medium">Model:</span> {item.model}</p>}
                      {item.installYear != null && <p><span className="font-medium">Installed:</span> {item.installYear}</p>}
                    </>
                  )}
                  {item.kind !== 'inventory' && 'notes' in item && item.notes && <p><span className="font-medium">Notes:</span> {item.notes}</p>}
                </>
              )}
              {expanded && item.kind === 'note' && (
                <p className="whitespace-pre-wrap">{item.body}</p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-0.5"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Less' : 'More'}
            </button>
            {item.kind !== 'note' && (
              <input
                type="text"
                value={item.title}
                onChange={(e) => onChange({ ...item, title: e.target.value })}
                aria-label="Title"
                placeholder="Edit title"
                className="text-xs flex-1 input-surface rounded-lg px-2 py-1 hidden"
                data-idx={idx}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

type Stage = 'input' | 'parsing' | 'review' | 'committing'

export function ImportScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { activePropertyId } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [text,    setText]    = useState('')
  const [stage,   setStage]   = useState<Stage>('input')
  const [error,   setError]   = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [approved, setApproved] = useState<Set<number>>(new Set())

  const hasKey = !!getOpenRouterKey()

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setText(String(ev.target?.result ?? ''))
    reader.onerror = () => toast.error('Could not read file')
    reader.readAsText(file)
    e.target.value = ''
  }

  async function runExtract(useLlm: boolean) {
    setError('')
    setStage('parsing')
    try {
      const result = useLlm ? await parseWithLlm(text) : await parseConversation(text)
      setPreview(result)
      setApproved(new Set(result.items.map((_, i) => i)))
      setStage('review')
      if (result.items.length === 0) {
        toast.info('No items found in the input.')
      } else {
        toast.success(`Extracted ${result.items.length} item${result.items.length === 1 ? '' : 's'} (${result.source === 'llm' ? 'AI' : 'fast-path'})`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStage('input')
      toast.error(`Extraction failed: ${msg}`)
    }
  }

  function fastPathOnly() {
    setError('')
    const result = parseFromFencedBlocks(text)
    setPreview(result)
    setApproved(new Set(result.items.map((_, i) => i)))
    setStage('review')
    if (result.items.length === 0) toast.info('No fenced blocks found — try AI extraction.')
    else toast.success(`Parsed ${result.items.length} block${result.items.length === 1 ? '' : 's'}`)
  }

  function toggleApproval(idx: number) {
    setApproved(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function updateItem(idx: number, next: ImportItem) {
    setPreview(p => {
      if (!p) return p
      const items = [...p.items]
      items[idx] = next
      return { ...p, items }
    })
  }

  async function commit() {
    if (!preview) return
    const propertyId = preview.propertyId || activePropertyId
    setStage('committing')
    let counts = { task: 0, purchase: 0, completed: 0, inventory: 0, note: 0 }
    for (let i = 0; i < preview.items.length; i++) {
      if (!approved.has(i)) continue
      const it = preview.items[i]
      try {
        switch (it.kind) {
          case 'task':      writeTask(it, propertyId);       counts.task++;      break
          case 'purchase':  writePurchase(it, propertyId);   counts.purchase++;  break
          case 'completed': writeCompleted(it, propertyId);  counts.completed++; break
          case 'inventory': counts.inventory++; break  // user must use the capture flow
          case 'note':      writeNote(it, propertyId);       counts.note++;      break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Failed to import "${'title' in it ? it.title : ''}": ${msg}`)
      }
    }
    const summary = [
      counts.task      && `${counts.task} task${counts.task === 1 ? '' : 's'}`,
      counts.purchase  && `${counts.purchase} capital item${counts.purchase === 1 ? '' : 's'}`,
      counts.completed && `${counts.completed} completed event${counts.completed === 1 ? '' : 's'}`,
      counts.note      && `${counts.note} note${counts.note === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ') || 'nothing'
    toast.success(`Imported ${summary}`)
    if (counts.inventory > 0) {
      toast.info(`${counts.inventory} inventory item${counts.inventory === 1 ? '' : 's'} need capture — head to Inventory.`)
    }
    navigate('/maintenance')
  }

  // grouped by kind for display
  const groups = (preview?.items ?? []).reduce<Record<string, number[]>>((acc, _, i) => {
    const k = preview!.items[i].kind
    ;(acc[k] = acc[k] ?? []).push(i)
    return acc
  }, {})

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-500" />
          Import Conversation
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Paste or upload a Claude conversation summary. Fenced blocks parse instantly; prose-only inputs use OpenRouter to extract.
        </p>
      </div>

      {stage === 'input' || stage === 'parsing' ? (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="btn">
                <Upload className="w-3.5 h-3.5" />
                Upload .md
              </button>
              <input ref={fileInputRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={handleFile} />
              <span className="text-xs text-slate-400 dark:text-slate-500">or paste below</span>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste the conversation summary markdown here…"
              rows={12}
              className="w-full text-sm input-surface rounded-xl px-3 py-2 font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={fastPathOnly}
                disabled={!text.trim() || stage === 'parsing'}
                className="btn"
                title="Parse fenced ```task / ```purchase / ... blocks. No API call."
              >
                Parse blocks only
              </button>
              <button
                onClick={() => runExtract(false)}
                disabled={!text.trim() || stage === 'parsing'}
                className="btn btn-primary flex-1"
              >
                {stage === 'parsing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Extract
              </button>
            </div>
            {!hasKey && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                AI fallback is disabled — add an OpenRouter key in Settings to extract from prose-only summaries.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      ) : null}

      {stage === 'review' && preview && (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {preview.items.length} item{preview.items.length === 1 ? '' : 's'} extracted ({preview.source === 'llm' ? 'AI' : 'fast path'})
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {approved.size} of {preview.items.length} approved
              </p>
            </div>
            <button onClick={() => { setStage('input'); setPreview(null) }} className="btn">Back</button>
            <button
              onClick={commit}
              disabled={approved.size === 0}
              className="btn btn-primary"
            >
              Import {approved.size}
            </button>
          </div>

          {(['task', 'purchase', 'completed', 'inventory', 'note'] as const).map(kind => {
            const indices = groups[kind] ?? []
            if (indices.length === 0) return null
            const meta = KIND_LABEL[kind]
            const Icon = meta.icon
            return (
              <section key={kind} className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Icon className={cn('w-3.5 h-3.5', meta.color)} />
                  {meta.label} ({indices.length})
                </h2>
                <div className="space-y-2">
                  {indices.map(i => {
                    const it = preview.items[i]
                    const titleForDupe = it.kind === 'note' ? '' : it.title
                    return (
                      <ItemCard
                        key={i}
                        item={it}
                        idx={i}
                        approved={approved.has(i)}
                        dupe={titleForDupe ? isProbableDupe(titleForDupe, preview.propertyId || activePropertyId) : false}
                        onToggle={() => toggleApproval(i)}
                        onChange={(next) => updateItem(i, next)}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}

      {stage === 'committing' && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
          Importing…
        </div>
      )}
    </div>
  )
}

// ── Write-back helpers ───────────────────────────────────────────────────────

function severityToPriority(s?: ImportTask['priority']): Priority {
  if (s === 'critical') return 'critical'
  if (s === 'high')     return 'high'
  if (s === 'low')      return 'low'
  return 'medium'
}

function dueIn(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function writeTask(it: ImportTask, propertyId: string): void {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  customTaskStore.add({
    id,
    propertyId,
    title:       it.title,
    systemLabel: it.category ?? 'General',
    categoryId:  it.category ?? 'service_record',
    dueDate:     it.due ?? dueIn(30),
    priority:    severityToPriority(it.priority),
    status:      'upcoming',
    source:      'ai-suggested',
    recurrence:  it.recurrence === 'once' ? undefined : it.recurrence,
    estimatedCost: it.estimatedCost,
    notes:       [it.notes, it.rawText && `From conversation: "${it.rawText}"`].filter(Boolean).join('\n\n') || undefined,
  })
}

function writePurchase(it: ImportPurchase, propertyId: string): void {
  capitalItemStore.add({
    id:            crypto.randomUUID(),
    propertyId,
    title:         it.title,
    categoryId:    it.category ?? 'general',
    priority:      'medium',
    estimatedYear: new Date().getFullYear(),
    costLow:       it.estimatedCost ?? 0,
    costHigh:      it.estimatedCost ?? 0,
    notes:         [it.notes, it.vendor && `Vendor: ${it.vendor}`, it.rawText && `From conversation: "${it.rawText}"`].filter(Boolean).join('\n\n') || undefined,
    source:        'ai-suggested',
    status:        'planned',
  })
}

function writeCompleted(it: ImportCompleted, propertyId: string): void {
  costStore.add({
    id:             crypto.randomUUID(),
    taskId:         '',
    taskTitle:      it.title,
    categoryId:     it.category ?? 'service_record',
    propertyId,
    completionDate: it.dateCompleted ?? new Date().toISOString().slice(0, 10),
    cost:           it.cost,
    contractor:     it.contractor,
    notes:          [it.notes, it.rawText && `From conversation: "${it.rawText}"`].filter(Boolean).join('\n\n') || undefined,
  })
}

function writeNote(it: ImportNote, propertyId: string): void {
  // Append to a `pm_notes_<propertyId>` localStorage list; keeps the
  // notes browseable without polluting the maintenance/capital paths.
  const key = `pm_notes_${propertyId}`
  const existing = (() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string; title: string; body: string; createdAt: string }> }
    catch { return [] }
  })()
  existing.unshift({
    id:        crypto.randomUUID(),
    title:     it.title,
    body:      it.body,
    createdAt: new Date().toISOString(),
  })
  localStorage.setItem(key, JSON.stringify(existing))
}
