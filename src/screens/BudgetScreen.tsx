import { useState } from 'react'
import {
  TrendingUp, Plus, Info, AlertTriangle, CheckCircle2,
  ArrowLeft, Trash2, ChevronDown, ChevronUp, AlertCircle, X, Pencil,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES } from '../data/mockData'
import { costStore } from '../lib/costStore'
import { useAppStore } from '../store/AppStoreContext'
import { useModalA11y } from '../lib/focusTrap'
import type { Priority, CapitalItem, CapitalTransaction } from '../types'
import {
  capitalTransactionStore,
  capitalItemOverrideStore,
  getTransactionsForItem,
  spentToDate,
  getOverride,
  setOverride,
} from '../lib/capitalStore'
import {
  capitalItemStore,
  getCapitalItemsForProperty,
} from '../lib/capitalItemStore'

type Horizon = '1yr' | '3yr' | '10yr'

function priorityConfig(p: Priority) {
  return {
    critical: { label: 'Critical', bar: 'bg-red-500',    badge: 'text-red-700 bg-red-50 border-red-200'         },
    high:     { label: 'High',     bar: 'bg-orange-500', badge: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' },
    medium:   { label: 'Medium',   bar: 'bg-amber-400',  badge: 'text-amber-700 bg-amber-50 border-amber-200'   },
    low:      { label: 'Low',      bar: 'bg-slate-300',  badge: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'   },
  }[p]
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  'in-progress': 'In Progress',
  complete: 'Complete',
}

const CURRENT_YEAR = 2026

function groupByYear(items: CapitalItem[], maxYear: number) {
  const grouped: Record<number, CapitalItem[]> = {}
  items
    .filter(i => i.estimatedYear <= maxYear)
    .forEach(item => {
      if (!grouped[item.estimatedYear]) grouped[item.estimatedYear] = []
      grouped[item.estimatedYear].push(item)
    })
  return grouped
}

function yearTotal(items: CapitalItem[]) {
  return {
    low:  items.reduce((s, i) => s + i.costLow,  0),
    high: items.reduce((s, i) => s + i.costHigh, 0),
  }
}

// ── Capital Item Detail View ────────────────────────────────────────────────

interface TxFormState {
  date: string
  amount: string
  invoiceRef: string
  notes: string
}

const emptyTxForm = (): TxFormState => ({
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  invoiceRef: '',
  notes: '',
})

function CapitalItemDetail({
  item,
  onBack,
  onMutate,
}: {
  item: CapitalItem
  onBack: () => void
  onMutate: () => void
}) {
  const [tick, setTick] = useState(0)
  const [showAddTx, setShowAddTx] = useState(false)
  const [editingTx, setEditingTx] = useState<CapitalTransaction | null>(null)
  const [txForm, setTxForm] = useState<TxFormState>(emptyTxForm())

  const refresh = () => { setTick(t => t + 1); onMutate() }

  const transactions = getTransactionsForItem(item.id)
  const spent = spentToDate(item.id)
  const override = getOverride(item.id)
  const status = override?.status ?? 'planned'
  const pctComplete = override?.percentComplete ?? Math.min(100, Math.round(spent / item.costHigh * 100))
  const overBudget = spent > item.costHigh
  const pconf = priorityConfig(item.priority)

  // Progress bar colour
  const barColor = overBudget ? 'bg-red-500' : spent > item.costLow ? 'bg-amber-400' : 'bg-emerald-500'

  function saveTx() {
    const amount = parseFloat(txForm.amount)
    if (!txForm.date || isNaN(amount) || amount <= 0) return
    if (editingTx) {
      capitalTransactionStore.update({ ...editingTx, date: txForm.date, amount, invoiceRef: txForm.invoiceRef || undefined, notes: txForm.notes || undefined })
    } else {
      capitalTransactionStore.add({
        id: crypto.randomUUID(),
        capitalItemId: item.id,
        date: txForm.date,
        amount,
        invoiceRef: txForm.invoiceRef || undefined,
        notes: txForm.notes || undefined,
      })
    }
    setShowAddTx(false)
    setEditingTx(null)
    setTxForm(emptyTxForm())
    refresh()
  }

  function deleteTx(id: string) {
    capitalTransactionStore.remove(id)
    refresh()
  }

  function startEdit(tx: CapitalTransaction) {
    setEditingTx(tx)
    setTxForm({ date: tx.date, amount: String(tx.amount), invoiceRef: tx.invoiceRef ?? '', notes: tx.notes ?? '' })
    setShowAddTx(true)
  }

  function cancelTx() {
    setShowAddTx(false)
    setEditingTx(null)
    setTxForm(emptyTxForm())
  }

  // Suppress tick-only lint warning
  void tick

  return (
    <div className="space-y-5">

      {/* Back + title */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:text-green-300 mb-3 -ml-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to budget
        </button>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">{item.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {item.installYear ? `Installed ${item.installYear} (${item.ageYears} yrs)` : `Planned ${item.estimatedYear}`}
            </p>
          </div>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border mt-1', pconf.badge)}>
            {pconf.label}
          </span>
        </div>
      </div>

      {/* Budget vs Actual card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Budget vs. Actual</span>
          {overBudget && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Over budget
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Budget (low)</p>
            <p className="text-base font-bold text-slate-800 dark:text-slate-200">${item.costLow.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Budget (high)</p>
            <p className="text-base font-bold text-slate-800 dark:text-slate-200">${item.costHigh.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Spent</p>
            <p className={cn('text-base font-bold', overBudget ? 'text-red-600' : 'text-slate-800 dark:text-slate-200')}>
              ${spent.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Progress</span>
            <span>{pctComplete}%</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(pctComplete, 100)}%` }}
            />
          </div>
          {overBudget && (
            <p className="text-xs text-red-600 mt-1">
              ${(spent - item.costHigh).toLocaleString()} over high estimate
            </p>
          )}
        </div>

        {/* Status + manual % complete */}
        <div className="flex gap-3 pt-1">
          <div className="flex-1">
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Status</label>
            <select
              value={status}
              onChange={e => { setOverride(item.id, { status: e.target.value as 'planned' | 'in-progress' | 'complete' }); refresh() }}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
            >
              <option value="planned">Planned</option>
              <option value="in-progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
          <div className="w-28">
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">% Complete</label>
            <input
              type="number"
              min={0}
              max={100}
              value={pctComplete}
              onChange={e => { setOverride(item.id, { percentComplete: Math.min(100, Math.max(0, Number(e.target.value))) }); refresh() }}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5"
            />
          </div>
        </div>
      </div>

      {/* Transaction ledger */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Transaction Ledger</h2>
          {!showAddTx && (
            <button
              onClick={() => setShowAddTx(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-800 dark:text-green-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {/* Add / Edit form */}
        {showAddTx && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 mb-3 space-y-3">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">{editingTx ? 'Edit transaction' : 'New transaction'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Date *</label>
                <input
                  type="date"
                  value={txForm.date}
                  onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Amount ($) *</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0.00"
                  value={txForm.amount}
                  onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Invoice / Ref</label>
              <input
                type="text"
                placeholder="Invoice #, check #, etc."
                value={txForm.invoiceRef}
                onChange={e => setTxForm(f => ({ ...f, invoiceRef: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Notes</label>
              <input
                type="text"
                placeholder="Vendor, work description…"
                value={txForm.notes}
                onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveTx}
                className="btn btn-primary flex-1"
              >
                {editingTx ? 'Save changes' : 'Add transaction'}
              </button>
              <button
                onClick={cancelTx}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Ledger rows */}
        {transactions.length > 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">${tx.amount.toLocaleString()}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {tx.invoiceRef && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tx.invoiceRef}</p>}
                  {tx.notes && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{tx.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0 mt-0.5">
                  <button
                    onClick={() => startEdit(tx)}
                    className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:text-green-300 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTx(tx.id)}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700/50">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total spent</span>
              <span className={cn('text-sm font-bold', overBudget ? 'text-red-600' : 'text-slate-800 dark:text-slate-200')}>
                ${spent.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <p className="text-sm">No transactions yet</p>
            <p className="text-xs mt-1">Tap Add to record a payment or invoice</p>
          </div>
        )}
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Capital Item Form (Add / Edit) ──────────────────────────────────────────

const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

function CapitalItemForm({
  initial,
  propertyId,
  onSave,
  onClose,
}: {
  initial?: CapitalItem
  propertyId: string
  onSave: () => void
  onClose: () => void
}) {
  const [title,         setTitle]         = useState(initial?.title ?? '')
  const [categoryId,    setCategoryId]    = useState(initial?.categoryId ?? CATEGORIES[0]?.id ?? '')
  const [priority,      setPriority]      = useState<Priority>(initial?.priority ?? 'medium')
  const [estimatedYear, setEstimatedYear] = useState(String(initial?.estimatedYear ?? CURRENT_YEAR + 1))
  const [costLow,       setCostLow]       = useState(initial?.costLow !== undefined ? String(initial.costLow) : '')
  const [costHigh,      setCostHigh]      = useState(initial?.costHigh !== undefined ? String(initial.costHigh) : '')
  const [installYear,   setInstallYear]   = useState(initial?.installYear !== undefined ? String(initial.installYear) : '')
  const [notes,         setNotes]         = useState(initial?.notes ?? '')
  const [status,        setStatus]        = useState<NonNullable<CapitalItem['status']>>(initial?.status ?? 'planned')
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function handleSave() {
    const yr     = Number(estimatedYear)
    const lo     = Number(costLow)
    const hi     = Number(costHigh)
    if (!title.trim() || !categoryId || !Number.isFinite(yr) || !Number.isFinite(lo) || !Number.isFinite(hi)) return
    const installYr = installYear ? Number(installYear) : undefined
    const ageYears  = installYr ? Math.max(0, CURRENT_YEAR - installYr) : undefined

    const item: CapitalItem = {
      id:            initial?.id ?? crypto.randomUUID(),
      propertyId,
      title:         title.trim(),
      categoryId,
      installYear:   installYr,
      ageYears,
      priority,
      estimatedYear: yr,
      costLow:       Math.min(lo, hi),
      costHigh:      Math.max(lo, hi),
      notes:         notes.trim() || undefined,
      source:        initial?.source ?? 'manual',
      status,
      percentComplete: initial?.percentComplete,
    }
    if (initial) capitalItemStore.update(item)
    else         capitalItemStore.add(item)

    // Keep the override store in sync with status changes so the rollup view
    // reflects the edited status without a separate dialog.
    setOverride(item.id, { status })

    onSave()
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capital-item-form-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="capital-item-form-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initial ? 'Edit Capital Project' : 'Add Capital Project'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Name *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Water Heater replacement"
            className={inp}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Category *</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Priority *</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={inp}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Planned Year *</label>
            <input
              type="number"
              value={estimatedYear}
              onChange={e => setEstimatedYear(e.target.value)}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as NonNullable<CapitalItem['status']>)} className={inp}>
              <option value="planned">Planned</option>
              <option value="in-progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Cost (low) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                value={costLow}
                onChange={e => setCostLow(e.target.value)}
                placeholder="0"
                className={cn(inp, 'pl-7')}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Cost (high) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                value={costHigh}
                onChange={e => setCostHigh(e.target.value)}
                placeholder="0"
                className={cn(inp, 'pl-7')}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Install Year (optional)</label>
          <input
            type="number"
            value={installYear}
            onChange={e => setInstallYear(e.target.value)}
            placeholder="e.g. 2009"
            className={inp}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Context, vendor quotes, decision notes…"
            className={inp}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary btn-lg flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !costLow || !costHigh || !estimatedYear}
            className="btn btn-primary btn-lg flex-[2]"
          >
            {initial ? 'Save changes' : 'Add project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Year row (list view) ────────────────────────────────────────────────────

function YearRow({
  year,
  items,
  maxTotal,
  onSelectItem,
  onEditItem,
  onDeleteItem,
}: {
  year: number
  items: CapitalItem[]
  maxTotal: number
  onSelectItem: (id: string) => void
  onEditItem: (item: CapitalItem) => void
  onDeleteItem: (item: CapitalItem) => void
}) {
  const [expanded, setExpanded] = useState(year === CURRENT_YEAR)
  const [tick] = useState(0)
  void tick

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
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              ${total.low.toLocaleString()}–${total.high.toLocaleString()}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
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
        </p>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700/50">
          {items.map(item => {
            const iconf = priorityConfig(item.priority)
            const spent = spentToDate(item.id)
            const override = getOverride(item.id)
            const status = override?.status ?? 'planned'
            const pctComplete = override?.percentComplete ?? Math.min(100, Math.round(spent / item.costHigh * 100))
            const overBudget = spent > item.costHigh

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-slate-700/30 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <button
                  onClick={() => onSelectItem(item.id)}
                  className="flex items-start gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', iconf.bar)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.installYear ? `Installed ${item.installYear} (${item.ageYears} yrs)` : `Planned ${item.estimatedYear}`}
                      {' · '}
                      <span className="capitalize">{STATUS_LABELS[status] ?? status}</span>
                    </p>
                    {/* Budget vs spent mini row */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', overBudget ? 'bg-red-500' : 'bg-emerald-500')}
                          style={{ width: `${Math.min(pctComplete, 100)}%` }}
                        />
                      </div>
                      <span className={cn('text-xs font-medium shrink-0', overBudget ? 'text-red-600' : 'text-slate-500 dark:text-slate-400')}>
                        {spent > 0 ? `$${spent.toLocaleString()} spent` : `$${item.costLow.toLocaleString()}–$${item.costHigh.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {overBudget && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <button
                    onClick={() => onEditItem(item)}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 rounded-lg"
                    aria-label={`Edit ${item.title}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteItem(item)}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 rounded-lg"
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main BudgetScreen ───────────────────────────────────────────────────────

export function BudgetScreen() {
  const { activePropertyId } = useAppStore()
  const [horizon, setHorizon] = useState<Horizon>('3yr')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CapitalItem | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState<CapitalItem | null>(null)
  void tick

  const propertyCapitalItems = getCapitalItemsForProperty(activePropertyId)
  // Dedupe by id — older localStorage states sometimes contain duplicate seeds
  const completedEvents      = Array.from(
    new Map(
      costStore.getAll()
        .filter(e => e.propertyId === activePropertyId)
        .map(e => [e.id, e]),
    ).values(),
  ).sort((a, b) => b.completionDate.localeCompare(a.completionDate))

  function openAdd() {
    setEditItem(undefined)
    setShowForm(true)
  }
  function openEdit(item: CapitalItem) {
    setEditItem(item)
    setShowForm(true)
  }
  function requestDelete(item: CapitalItem) {
    setConfirmDelete(item)
  }
  function confirmDeleteNow() {
    if (!confirmDelete) return
    capitalItemStore.remove(confirmDelete.id)
    setConfirmDelete(null)
    setTick(t => t + 1)
  }

  const maxYear = horizon === '1yr' ? CURRENT_YEAR : horizon === '3yr' ? CURRENT_YEAR + 2 : CURRENT_YEAR + 9
  const grouped = groupByYear(propertyCapitalItems, maxYear)
  const years   = Object.keys(grouped).map(Number).sort()

  const allItems = propertyCapitalItems.filter(i => i.estimatedYear <= maxYear)
  const totalLow  = allItems.reduce((s, i) => s + i.costLow,  0)
  const totalHigh = allItems.reduce((s, i) => s + i.costHigh, 0)
  const maxYearTotal = Math.max(...years.map(y => yearTotal(grouped[y]).high), 1)

  const annualReserve = Math.round(totalHigh / (maxYear - CURRENT_YEAR + 1) / 12)
  const totalHistoricalSpend = completedEvents.reduce((s, e) => s + (e.cost ?? 0), 0)
  const annualAvgSpend = Math.round(totalHistoricalSpend / 2)

  // Detail view
  if (selectedItemId) {
    const item = propertyCapitalItems.find(i => i.id === selectedItemId)
    if (item) {
      return (
        <CapitalItemDetail
          item={item}
          onBack={() => setSelectedItemId(null)}
          onMutate={() => setTick(t => t + 1)}
        />
      )
    }
  }

  const horizons: { id: Horizon; label: string }[] = [
    { id: '1yr',  label: '1 Year'  },
    { id: '3yr',  label: '3 Years' },
    { id: '10yr', label: '10 Years'},
  ]

  // Suppress unused store import warnings by referencing them
  void capitalItemOverrideStore

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Budget & Capital</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Forecast based on equipment ages and known replacement needs</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary shrink-0">
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {/* Horizon selector */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
        {horizons.map(h => (
          <button
            key={h.id}
            onClick={() => setHorizon(h.id)}
            className={cn(
              'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
              horizon === h.id ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Est. Total',       value: `$${Math.round(totalLow/1000)}k–$${Math.round(totalHigh/1000)}k`, icon: TrendingUp,   color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'         },
          { label: 'Monthly Reserve',  value: `$${annualReserve}/mo`,                                            icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Items Planned',    value: `${allItems.length}`,                                               icon: AlertTriangle, color: 'text-orange-500 bg-orange-50' },
          { label: 'Avg Annual Spend', value: `$${annualAvgSpend.toLocaleString()}`,                              icon: Info,         color: 'text-violet-600 bg-violet-50'  },
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Tap an item to track budget vs. actual and log transactions</p>
        <div className="space-y-3">
          {years.map(year => (
            <YearRow
              key={year}
              year={year}
              items={grouped[year]}
              maxTotal={maxYearTotal}
              onSelectItem={setSelectedItemId}
              onEditItem={openEdit}
              onDeleteItem={requestDelete}
            />
          ))}
          {years.length === 0 && (
            <div className="text-center py-10 text-slate-400 dark:text-slate-500">
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
          {completedEvents.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No completed maintenance events yet.
            </div>
          )}
          {completedEvents.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{e.taskTitle}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {e.categoryId.replace(/_/g, ' ')}
                  {e.contractor ? ` · ${e.contractor}` : ''}
                  {' · '}
                  {new Date(e.completionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              {e.cost !== undefined && (
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  ${e.cost.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {completedEvents.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total recorded</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">${totalHistoricalSpend.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Add capital item */}
      <button
        onClick={openAdd}
        className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Capital Project
      </button>

      {showForm && (
        <CapitalItemForm
          initial={editItem}
          propertyId={activePropertyId}
          onSave={() => setTick(t => t + 1)}
          onClose={() => { setShowForm(false); setEditItem(undefined) }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          item={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteNow}
        />
      )}

    </div>
  )
}

// ── Delete confirmation modal ────────────────────────────────────────────────

function ConfirmDeleteModal({
  item, onCancel, onConfirm,
}: { item: CapitalItem; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-delete-modal-title"
        className="modal-surface w-full max-w-sm rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="budget-delete-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Delete capital project?</h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Remove <strong>{item.title}</strong> from the forecast?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Logged transactions for this project will remain in the ledger but will no longer roll up under any item. This action cannot be undone from the UI.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>
  )
}
