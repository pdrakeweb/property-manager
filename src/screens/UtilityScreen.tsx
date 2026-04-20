import { useState } from 'react'
import {
  Plus, X, Camera, Upload, Sparkles, Loader2, AlertCircle, CheckCircle2, Zap,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'
import {
  utilityAccountStore, utilityBillStore,
  getAccountsForProperty, getBillsForAccount, getBillsForProperty,
  UTILITY_LABELS, UTILITY_COLORS, UTILITY_BADGE, getMonthlySpend,
} from '../lib/utilityStore'
import { useDocumentExtraction } from '../hooks/useDocumentExtraction'
import type { UtilityAccount, UtilityBill, UtilityType } from '../schemas'

const baseInput = 'w-full text-sm input-surface rounded-xl px-3 py-2.5 transition-all'

const UTILITY_TYPES: UtilityType[] = ['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'phone', 'other']

const BILL_FIELD_IDS = ['periodStart', 'periodEnd', 'consumption', 'unit', 'totalCost', 'ratePerUnit']
const BILL_PROMPT    = 'This is a utility bill. Extract: billing period start date (YYYY-MM-DD), billing period end date (YYYY-MM-DD), consumption amount (number only), unit of consumption (kWh/CCF/gallons/etc), total amount due ($), and rate per unit ($). Return confidence high/medium/low for each field. If not visible return value "" with confidence "low".'

// ── Capture panel ─────────────────────────────────────────────────────────────

function CapturePanel({
  onExtracted,
}: {
  onExtracted: (vals: Record<string, string>) => void
}) {
  const { aiState, aiError, docs, cameraRef, uploadRef, handleFilesChosen, removeDoc, clearExtraction, extracted } =
    useDocumentExtraction(BILL_FIELD_IDS, BILL_PROMPT)

  const [pushed, setPushed] = useState(false)
  if (aiState === 'done' && !pushed) {
    setPushed(true)
    const vals: Record<string, string> = {}
    for (const [k, v] of Object.entries(extracted)) vals[k] = v.value
    onExtracted(vals)
  }
  if (aiState !== 'done' && pushed) setPushed(false)

  return (
    <div className="card-surface rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Photograph or Upload Bill</h2>
          <span className="flex items-center gap-1 text-xs text-sky-600">
            <Sparkles className="w-3 h-3" />
            AI extraction
          </span>
        </div>

        <input
          ref={cameraRef}
          type="file" accept="image/*" capture="environment"
          className="hidden"
          onChange={e => handleFilesChosen(e.target.files, true)}
        />
        <input
          ref={uploadRef}
          type="file" accept="image/*,application/pdf"
          className="hidden"
          onChange={e => handleFilesChosen(e.target.files, true)}
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={aiState === 'extracting'}
            className="btn btn-info"
          >
            <Camera className="w-4 h-4" />
            Capture
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={aiState === 'extracting'}
            className="btn btn-secondary"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>

        {aiState !== 'idle' && (
          <div className={cn(
            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm mb-3',
            aiState === 'extracting' && 'bg-sky-50 text-sky-700',
            aiState === 'done'       && 'bg-emerald-50 text-emerald-700',
            aiState === 'error'      && 'bg-red-50 text-red-700',
          )}>
            {aiState === 'extracting' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            {aiState === 'done'       && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {aiState === 'error'      && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-medium flex-1 text-sm">
              {aiState === 'extracting' && 'Extracting bill data…'}
              {aiState === 'done'       && 'Extraction complete — review fields below'}
              {aiState === 'error'      && (aiError || 'Extraction failed — fill manually')}
            </span>
            {(aiState === 'done' || aiState === 'error') && (
              <button onClick={clearExtraction} className="text-xs opacity-70 hover:opacity-100 shrink-0">Clear</button>
            )}
          </div>
        )}

        {docs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {docs.map((d, i) => (
              <div key={i} className="relative w-14 h-14 rounded-lg border border-slate-200 overflow-hidden group bg-slate-100">
                {d.mimeType.startsWith('image') ? (
                  <img src={d.preview} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-medium">PDF</div>
                )}
                <button
                  onClick={() => removeDoc(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 text-white rounded-full items-center justify-center hidden group-hover:flex"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bill form ─────────────────────────────────────────────────────────────────

function BillForm({
  account,
  onSaved,
  onCancel,
}: {
  account: UtilityAccount
  onSaved: () => void
  onCancel: () => void
}) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [vals, setVals] = useState<Record<string, string>>({
    periodStart:  todayStr,
    periodEnd:    '',
    consumption:  '',
    unit:         '',
    totalCost:    '',
    ratePerUnit:  '',
    notes:        '',
  })

  function handleSave() {
    const bill: UtilityBill = {
      id:          `ub_${Date.now()}`,
      accountId:   account.id,
      propertyId:  account.propertyId,
      periodStart: vals.periodStart,
      periodEnd:   vals.periodEnd,
      consumption: vals.consumption ? parseFloat(vals.consumption) : undefined,
      unit:        vals.unit || undefined,
      totalCost:   parseFloat(vals.totalCost) || 0,
      ratePerUnit: vals.ratePerUnit ? parseFloat(vals.ratePerUnit) : undefined,
      notes:       vals.notes || undefined,
    }
    utilityBillStore.add(bill)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <CapturePanel onExtracted={v => setVals(prev => ({ ...prev, ...v }))} />

      <div className="card-surface rounded-2xl shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', UTILITY_COLORS[account.type])} />
          <h3 className="text-sm font-semibold text-slate-700">{account.provider} · {UTILITY_LABELS[account.type]}</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Period Start</label>
            <input type="date" value={vals.periodStart} onChange={e => setVals(p => ({ ...p, periodStart: e.target.value }))} className={baseInput} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Period End</label>
            <input type="date" value={vals.periodEnd} onChange={e => setVals(p => ({ ...p, periodEnd: e.target.value }))} className={baseInput} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Consumption</label>
            <input type="number" step="0.01" value={vals.consumption} onChange={e => setVals(p => ({ ...p, consumption: e.target.value }))} className={baseInput} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Unit</label>
            <input type="text" value={vals.unit} onChange={e => setVals(p => ({ ...p, unit: e.target.value }))} className={baseInput} placeholder="kWh, CCF, gal…" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Total Cost ($)</label>
            <input type="number" step="0.01" value={vals.totalCost} onChange={e => setVals(p => ({ ...p, totalCost: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Rate / unit ($)</label>
            <input type="number" step="0.0001" value={vals.ratePerUnit} onChange={e => setVals(p => ({ ...p, ratePerUnit: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
          <textarea rows={2} value={vals.notes} onChange={e => setVals(p => ({ ...p, notes: e.target.value }))} className={cn(baseInput, 'resize-none')} />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn btn-secondary btn-lg flex-1">Cancel</button>
        <button onClick={handleSave} className="btn btn-info btn-lg flex-1">Save Bill</button>
      </div>
    </div>
  )
}

// ── Account form ──────────────────────────────────────────────────────────────

function AccountForm({
  propertyId,
  onSaved,
  onCancel,
}: {
  propertyId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [type,          setType]          = useState<UtilityType>('electric')
  const [provider,      setProvider]      = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [notes,         setNotes]         = useState('')

  function handleSave() {
    const acct: UtilityAccount = {
      id:            `ua_${Date.now()}`,
      propertyId,
      type,
      provider,
      accountNumber: accountNumber || undefined,
      notes:         notes || undefined,
    }
    utilityAccountStore.add(acct)
    onSaved()
  }

  return (
    <div className="card-surface rounded-2xl shadow-sm p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Add Utility Account</h3>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
        <select value={type} onChange={e => setType(e.target.value as UtilityType)} className={baseInput}>
          {UTILITY_TYPES.map(t => <option key={t} value={t}>{UTILITY_LABELS[t]}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Provider</label>
        <input type="text" value={provider} onChange={e => setProvider(e.target.value)} className={baseInput} placeholder="e.g. Ohio Edison" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Account Number</label>
        <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className={baseInput} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={cn(baseInput, 'resize-none')} />
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn btn-secondary btn-lg flex-1">Cancel</button>
        <button onClick={handleSave} className="btn btn-info btn-lg flex-1">Add Account</button>
      </div>
    </div>
  )
}

// ── Monthly spend chart (CSS bar) ─────────────────────────────────────────────

function MonthlyChart({ propertyId }: { propertyId: string }) {
  const months = getMonthlySpend(propertyId).slice(-12)
  if (months.length === 0) return null

  const maxCost = Math.max(...months.map(m => m.cost), 1)

  return (
    <div className="card-surface rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Monthly Spend</h3>
      <div className="flex items-end gap-1.5 h-28">
        {months.map(m => {
          const pct = (m.cost / maxCost) * 100
          const label = new Date(m.month + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' })
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: '88px' }}>
                <div
                  className="w-full bg-sky-500 rounded-t-sm min-h-[3px] transition-all relative group"
                  style={{ height: `${pct}%` }}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                    ${m.cost.toFixed(0)}
                  </div>
                </div>
              </div>
              <span className="text-xs text-slate-400">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Account detail ────────────────────────────────────────────────────────────

type AccountDetailView = 'bills' | 'add-bill'

function AccountDetail({
  account,
  onBack,
  onDeleted,
}: {
  account: UtilityAccount
  onBack: () => void
  onDeleted: () => void
}) {
  const [view, setView] = useState<AccountDetailView>('bills')
  const [tick, setTick] = useState(0)
  const bills = getBillsForAccount(account.id)

  // YoY comparison: group by YYYY-MM, compare to same month last year
  const byMonth: Record<string, number> = {}
  for (const b of bills) {
    const month = b.periodStart.slice(0, 7)
    byMonth[month] = (byMonth[month] ?? 0) + b.totalCost
  }

  const thisYear = String(new Date().getFullYear())
  const ytd = bills
    .filter(b => (b.periodStart || '').startsWith(thisYear))
    .reduce((s, b) => s + b.totalCost, 0)

  if (view === 'add-bill') {
    return (
      <div className="space-y-5 max-w-xl" key={tick}>
        <button onClick={() => setView('bills')} className="text-sm text-sky-600 hover:text-sky-700">
          ← Back to {account.provider}
        </button>
        <h1 className="text-xl font-bold text-slate-900">Add Bill</h1>
        <BillForm
          account={account}
          onSaved={() => { setView('bills'); setTick(t => t + 1) }}
          onCancel={() => setView('bills')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl" key={tick}>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-sky-600 hover:text-sky-700">← Utility Accounts</button>
      </div>

      {/* Header card */}
      <div className="card-surface rounded-2xl shadow-sm p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', UTILITY_COLORS[account.type])}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{account.provider}</h2>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', UTILITY_BADGE[account.type])}>
                {UTILITY_LABELS[account.type]}
              </span>
            </div>
          </div>
          <button onClick={() => { utilityAccountStore.remove(account.id); onDeleted() }} className="text-xs text-red-400 hover:text-red-600">Delete</button>
        </div>
        {account.accountNumber && <p className="text-xs text-slate-400 font-mono mt-2">#{account.accountNumber}</p>}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">YTD spend ({new Date().getFullYear()})</p>
          <p className="text-xl font-bold text-slate-800 mt-0.5">${ytd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Bills list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{bills.length} bill{bills.length !== 1 ? 's' : ''}</h3>
        <button
          onClick={() => setView('add-bill')}
          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Add bill
        </button>
      </div>

      {bills.length === 0 ? (
        <div className="card-surface rounded-2xl p-8 text-center">
          <p className="text-sm text-muted">No bills recorded yet.</p>
          <button onClick={() => setView('add-bill')} className="mt-3 text-sm text-sky-600 font-medium hover:text-sky-700">+ Add first bill</button>
        </div>
      ) : (
        <div className="card-surface rounded-2xl overflow-hidden shadow-sm card-divider">
          {bills.map(b => {
            const prevYearKey = `${parseInt(b.periodStart.slice(0, 4)) - 1}-${b.periodStart.slice(5, 7)}`
            const prevYearCost = byMonth[prevYearKey]
            const delta = prevYearCost ? b.totalCost - prevYearCost : null
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {b.periodStart ? new Date(b.periodStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'No date'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {b.periodStart} → {b.periodEnd}
                    {b.consumption ? ` · ${b.consumption} ${b.unit ?? ''}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                    ${b.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {delta !== null && (
                    <p className={cn('text-xs tabular-nums', delta > 0 ? 'text-red-500' : 'text-emerald-600')}>
                      {delta > 0 ? '+' : ''}${delta.toFixed(0)} YoY
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Screen ──────────────────────────────────────────────────────────────

type MainView = 'list' | 'add-account' | { account: string }

export function UtilityScreen() {
  const { activePropertyId } = useAppStore()
  const [view, setView] = useState<MainView>('list')
  const [tick, setTick] = useState(0)

  const accounts = getAccountsForProperty(activePropertyId)
  const allBills = getBillsForProperty(activePropertyId)
  const currentYear = String(new Date().getFullYear())
  const totalYTD = allBills
    .filter(b => (b.periodStart || '').startsWith(currentYear))
    .reduce((s, b) => s + b.totalCost, 0)

  if (view === 'add-account') {
    return (
      <div className="space-y-5 max-w-xl">
        <button onClick={() => setView('list')} className="text-sm text-sky-600 hover:text-sky-700">← Utilities</button>
        <h1 className="text-xl font-bold text-slate-900">Add Utility Account</h1>
        <AccountForm
          propertyId={activePropertyId}
          onSaved={() => { setView('list'); setTick(t => t + 1) }}
          onCancel={() => setView('list')}
        />
      </div>
    )
  }

  if (typeof view === 'object' && 'account' in view) {
    const acct = utilityAccountStore.getById(view.account)
    if (acct) {
      return (
        <AccountDetail
          account={acct}
          onBack={() => setView('list')}
          onDeleted={() => { setView('list'); setTick(t => t + 1) }}
        />
      )
    }
  }

  return (
    <div className="space-y-5 max-w-2xl" key={tick}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Utilities</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bill tracking and consumption history</p>
        </div>
        <button
          onClick={() => setView('add-account')}
          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Add account
        </button>
      </div>

      {/* YTD summary */}
      {allBills.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card-surface rounded-2xl shadow-sm p-4">
            <p className="text-xs text-slate-500">YTD Total ({new Date().getFullYear()})</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">${totalYTD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="card-surface rounded-2xl shadow-sm p-4">
            <p className="text-xs text-slate-500">Total Bills</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{allBills.length}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {allBills.length > 0 && <MonthlyChart propertyId={activePropertyId} />}

      {/* Accounts list */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="card-surface rounded-2xl p-8 text-center">
            <Zap className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No utility accounts yet.</p>
            <button onClick={() => setView('add-account')} className="mt-3 text-sm text-sky-600 font-medium hover:text-sky-700">
              + Add first account
            </button>
          </div>
        ) : (
          accounts.map(acct => {
            const bills = getBillsForAccount(acct.id)
            const latest = bills[0]
            return (
              <button
                key={acct.id}
                onClick={() => setView({ account: acct.id })}
                className="w-full card-surface rounded-2xl shadow-sm p-4 text-left hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', UTILITY_COLORS[acct.type])}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{acct.provider}</span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', UTILITY_BADGE[acct.type])}>
                        {UTILITY_LABELS[acct.type]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {bills.length} bill{bills.length !== 1 ? 's' : ''}
                      {latest ? ` · Last: $${latest.totalCost.toFixed(2)} (${latest.periodStart.slice(0, 7)})` : ''}
                    </p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
