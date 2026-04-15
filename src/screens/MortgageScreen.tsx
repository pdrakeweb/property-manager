import { useState } from 'react'
import {
  Plus, X, Camera, Upload, Sparkles, Loader2, AlertCircle, CheckCircle2,
  TrendingDown, DollarSign, Calculator, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'
import {
  mortgageStore, mortgagePaymentStore,
  getMortgagesForProperty, getPaymentsForMortgage,
  buildAmortizationSchedule, simulateExtraPayment,
} from '../lib/mortgageStore'
import { useDocumentExtraction, confidenceRing } from '../hooks/useDocumentExtraction'
import type { Mortgage, MortgagePayment } from '../schemas'

const baseInput = 'w-full text-sm input-surface rounded-xl px-3 py-2.5 transition-all'

// ── Extraction fields ─────────────────────────────────────────────────────────

const MORTGAGE_FIELD_IDS = ['lender', 'accountNumber', 'originalBalance', 'currentBalance', 'interestRate', 'termMonths', 'startDate', 'monthlyPayment', 'escrowAmount']
const MORTGAGE_PROMPT    = 'This is a mortgage statement or closing document. Extract: lender name, account/loan number, original loan balance, current balance, annual interest rate (%), loan term in months, start/origination date (YYYY-MM-DD), monthly payment amount, and escrow amount if present. Return confidence high/medium/low for each field. If a field is not visible return value "" with confidence "low".'

const PAYMENT_FIELD_IDS = ['date', 'amount', 'principal', 'interest', 'escrow', 'extraPrincipal']
const PAYMENT_PROMPT    = 'This is a mortgage payment statement. Extract: payment date (YYYY-MM-DD), total payment amount, principal portion, interest portion, escrow portion, and any extra principal payment. Return confidence high/medium/low for each field. If a field is not visible return value "" with confidence "low".'

// ── Document capture panel (inline for this screen) ──────────────────────────

function CapturePanel({
  title,
  fieldIds,
  prompt,
  onExtracted,
}: {
  title: string
  fieldIds: string[]
  prompt: string
  onExtracted: (vals: Record<string, string>) => void
}) {
  const { aiState, aiError, docs, cameraRef, uploadRef, handleFilesChosen, removeDoc, clearExtraction, extracted } =
    useDocumentExtraction(fieldIds, prompt)

  // Push extracted values to parent once
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
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
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
            className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Capture
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={aiState === 'extracting'}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
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
              {aiState === 'extracting' && 'Extracting…'}
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

// ── Mortgage form ─────────────────────────────────────────────────────────────

function MortgageForm({
  propertyId,
  existing,
  onSaved,
  onCancel,
}: {
  propertyId: string
  existing?: Mortgage
  onSaved: () => void
  onCancel: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    label:           existing?.label           ?? 'Primary',
    lender:          existing?.lender          ?? '',
    accountNumber:   existing?.accountNumber   ?? '',
    originalBalance: existing?.originalBalance ? String(existing.originalBalance) : '',
    currentBalance:  existing?.currentBalance  ? String(existing.currentBalance)  : '',
    interestRate:    existing?.interestRate    ? String(existing.interestRate)    : '',
    termMonths:      existing?.termMonths      ? String(existing.termMonths)      : '360',
    startDate:       existing?.startDate       ?? '',
    monthlyPayment:  existing?.monthlyPayment  ? String(existing.monthlyPayment)  : '',
    escrowAmount:    existing?.escrowAmount    ? String(existing.escrowAmount)    : '',
    notes:           existing?.notes           ?? '',
  })
  const [extractedConf, setExtractedConf] = useState<Record<string, 'high' | 'medium' | 'low'>>({})

  function applyExtracted(v: Record<string, string>) {
    setVals(prev => ({ ...prev, ...v }))
    const conf: Record<string, 'high' | 'medium' | 'low'> = {}
    for (const k of Object.keys(v)) conf[k] = 'high'
    setExtractedConf(conf)
  }

  function handleSave() {
    const m: Mortgage = {
      id:              existing?.id ?? `mtg_${Date.now()}`,
      propertyId,
      label:           vals.label || 'Primary',
      lender:          vals.lender,
      accountNumber:   vals.accountNumber || undefined,
      originalBalance: parseFloat(vals.originalBalance) || 0,
      currentBalance:  parseFloat(vals.currentBalance)  || 0,
      interestRate:    parseFloat(vals.interestRate)    || 0,
      termMonths:      parseInt(vals.termMonths)        || 360,
      startDate:       vals.startDate,
      monthlyPayment:  parseFloat(vals.monthlyPayment)  || 0,
      escrowAmount:    vals.escrowAmount ? parseFloat(vals.escrowAmount) : undefined,
      notes:           vals.notes || undefined,
    }
    if (existing) mortgageStore.update(m)
    else          mortgageStore.add(m)
    onSaved()
  }

  const f = (id: string, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={vals[id] ?? ''}
        placeholder={placeholder}
        onChange={e => setVals(p => ({ ...p, [id]: e.target.value }))}
        className={cn(baseInput, extractedConf[id] ? confidenceRing(extractedConf[id]) : '')}
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <CapturePanel
        title="Photograph or Upload Mortgage Statement"
        fieldIds={MORTGAGE_FIELD_IDS}
        prompt={MORTGAGE_PROMPT}
        onExtracted={applyExtracted}
      />

      <div className="card-surface rounded-2xl shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Mortgage Details</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Label</label>
            <select
              value={vals.label}
              onChange={e => setVals(p => ({ ...p, label: e.target.value }))}
              className={baseInput}
            >
              {['Primary', 'HELOC', 'Second Mortgage', 'Construction', 'Other'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          {f('lender', 'Lender / Servicer')}
        </div>

        {f('accountNumber', 'Account / Loan Number')}

        <div className="grid grid-cols-2 gap-3">
          {f('originalBalance', 'Original Balance ($)', 'number', '0.00')}
          {f('currentBalance',  'Current Balance ($)',  'number', '0.00')}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {f('interestRate', 'Interest Rate (%)', 'number', '6.75')}
          {f('termMonths',   'Term (months)',     'number', '360')}
        </div>

        {f('startDate', 'Start / Origination Date', 'date')}

        <div className="grid grid-cols-2 gap-3">
          {f('monthlyPayment', 'Monthly P&I ($)', 'number', '0.00')}
          {f('escrowAmount',   'Escrow/month ($)', 'number', '0.00')}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
          <textarea rows={2} value={vals.notes} onChange={e => setVals(p => ({ ...p, notes: e.target.value }))} className={cn(baseInput, 'resize-none')} />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200">
          Cancel
        </button>
        <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">
          {existing ? 'Update' : 'Save'} Mortgage
        </button>
      </div>
    </div>
  )
}

// ── Payment form ──────────────────────────────────────────────────────────────

function PaymentForm({
  mortgageId,
  propertyId,
  onSaved,
  onCancel,
}: {
  mortgageId: string
  propertyId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    date:           new Date().toISOString().slice(0, 10),
    amount:         '',
    principal:      '',
    interest:       '',
    escrow:         '',
    extraPrincipal: '',
    notes:          '',
  })

  function handleSave() {
    const p: MortgagePayment = {
      id:             `mtgp_${Date.now()}`,
      mortgageId,
      propertyId,
      date:           vals.date,
      amount:         parseFloat(vals.amount)         || 0,
      principal:      parseFloat(vals.principal)      || 0,
      interest:       parseFloat(vals.interest)       || 0,
      escrow:         vals.escrow ? parseFloat(vals.escrow) : undefined,
      extraPrincipal: vals.extraPrincipal ? parseFloat(vals.extraPrincipal) : undefined,
      notes:          vals.notes || undefined,
    }
    mortgagePaymentStore.add(p)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <CapturePanel
        title="Photograph or Upload Payment Statement"
        fieldIds={PAYMENT_FIELD_IDS}
        prompt={PAYMENT_PROMPT}
        onExtracted={v => setVals(prev => ({ ...prev, ...v }))}
      />

      <div className="card-surface rounded-2xl shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Payment Details</h3>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Payment Date</label>
          <input type="date" value={vals.date} onChange={e => setVals(p => ({ ...p, date: e.target.value }))} className={baseInput} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Total Payment ($)</label>
            <input type="number" step="0.01" value={vals.amount} onChange={e => setVals(p => ({ ...p, amount: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Principal ($)</label>
            <input type="number" step="0.01" value={vals.principal} onChange={e => setVals(p => ({ ...p, principal: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Interest ($)</label>
            <input type="number" step="0.01" value={vals.interest} onChange={e => setVals(p => ({ ...p, interest: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Escrow ($)</label>
            <input type="number" step="0.01" value={vals.escrow} onChange={e => setVals(p => ({ ...p, escrow: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Extra Principal ($)</label>
          <input type="number" step="0.01" value={vals.extraPrincipal} onChange={e => setVals(p => ({ ...p, extraPrincipal: e.target.value }))} className={baseInput} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
          <textarea rows={2} value={vals.notes} onChange={e => setVals(p => ({ ...p, notes: e.target.value }))} className={cn(baseInput, 'resize-none')} />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200">Cancel</button>
        <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">Save Payment</button>
      </div>
    </div>
  )
}

// ── Amortization + simulator ──────────────────────────────────────────────────

const PAGE_SIZE = 24

function AmortizationView({ mortgage }: { mortgage: Mortgage }) {
  const [extra, setExtra] = useState('')
  const [page,  setPage]  = useState(0)
  const schedule = buildAmortizationSchedule(
    mortgage.currentBalance,
    mortgage.interestRate,
    mortgage.termMonths,
    mortgage.monthlyPayment,
  )

  const extraAmt = parseFloat(extra) || 0
  const sim = extraAmt > 0
    ? simulateExtraPayment(mortgage.currentBalance, mortgage.interestRate, mortgage.termMonths, mortgage.monthlyPayment, extraAmt)
    : null

  return (
    <div className="space-y-4">
      {/* Extra payment simulator */}
      <div className="card-surface rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Extra Payment Simulator</h3>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Extra $/month</label>
            <input
              type="number"
              step="50"
              value={extra}
              onChange={e => setExtra(e.target.value)}
              placeholder="0"
              className={baseInput}
            />
          </div>
        </div>
        {sim && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-xs text-emerald-600 font-medium">Months Saved</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{sim.monthsSaved}</p>
              <p className="text-xs text-emerald-600">({Math.round(sim.monthsSaved / 12 * 10) / 10} yrs)</p>
            </div>
            <div className="bg-sky-50 rounded-xl p-3 text-center">
              <p className="text-xs text-sky-600 font-medium">Interest Saved</p>
              <p className="text-xl font-bold text-sky-700 mt-0.5">${sim.interestSaved.toLocaleString()}</p>
              <p className="text-xs text-sky-600">total savings</p>
            </div>
          </div>
        )}
      </div>

      {/* Amortization table — paginated */}
      <div className="card-surface rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Amortization Schedule</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Months {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, schedule.length)} of {schedule.length}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="text-xs text-slate-500 tabular-nums w-12 text-center">
              {page + 1} / {Math.ceil(schedule.length / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= schedule.length}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left font-medium">Mo</th>
                <th className="px-4 py-2.5 text-right font-medium">Payment</th>
                <th className="px-4 py-2.5 text-right font-medium">Principal</th>
                <th className="px-4 py-2.5 text-right font-medium">Interest</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {schedule.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => (
                <tr key={row.month} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-600">{row.month}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">${(row.principal + row.interest).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600">${row.principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-500">${row.interest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">${row.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Mortgage detail view ──────────────────────────────────────────────────────

type DetailTab = 'payments' | 'amortization'

function MortgageDetail({
  mortgage,
  propertyId,
  onBack,
  onDeleted,
}: {
  mortgage: Mortgage
  propertyId: string
  onBack: () => void
  onDeleted: () => void
}) {
  const [tab,        setTab]        = useState<DetailTab>('payments')
  const [addingPmt,  setAddingPmt]  = useState(false)
  const [tick,       setTick]       = useState(0)

  const payments = getPaymentsForMortgage(mortgage.id)
  const ltv = mortgage.currentBalance / (mortgage.originalBalance || 1) * 100

  if (addingPmt) {
    return (
      <div className="space-y-5 max-w-xl">
        <button onClick={() => setAddingPmt(false)} className="text-sm text-sky-600 hover:text-sky-700">
          ← Back to {mortgage.label}
        </button>
        <h1 className="text-xl font-bold text-slate-900">Log Payment</h1>
        <PaymentForm
          mortgageId={mortgage.id}
          propertyId={propertyId}
          onSaved={() => { setAddingPmt(false); setTick(t => t + 1) }}
          onCancel={() => setAddingPmt(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl" key={tick}>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-sky-600 hover:text-sky-700">← All mortgages</button>
      </div>

      {/* Stats bar */}
      <div className="card-surface rounded-2xl shadow-sm p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{mortgage.label}</p>
            <h2 className="text-lg font-bold text-slate-900">{mortgage.lender}</h2>
            {mortgage.accountNumber && <p className="text-xs text-slate-400 font-mono">#{mortgage.accountNumber}</p>}
          </div>
          <button
            onClick={() => { mortgageStore.remove(mortgage.id); onDeleted() }}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Delete
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500">Current Balance</p>
            <p className="text-base font-bold text-slate-800 mt-0.5">${mortgage.currentBalance.toLocaleString()}</p>
          </div>
          <div className="bg-sky-50 rounded-xl p-3 text-center">
            <p className="text-xs text-sky-600">Rate</p>
            <p className="text-base font-bold text-sky-700 mt-0.5">{mortgage.interestRate}%</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-3 text-center">
            <p className="text-xs text-violet-600">Monthly</p>
            <p className="text-base font-bold text-violet-700 mt-0.5">${mortgage.monthlyPayment.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Paid down</span>
            <span>{Math.round(100 - ltv)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${100 - ltv}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {(['payments', 'amortization'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-medium py-2 rounded-lg transition-colors capitalize',
              tab === t ? 'toggle-active' : 'toggle-inactive',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'payments' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{payments.length} payment{payments.length !== 1 ? 's' : ''} logged</span>
            <button
              onClick={() => setAddingPmt(true)}
              className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Log payment
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="card-surface rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-500">No payments logged yet.</p>
            </div>
          ) : (
            <div className="card-surface rounded-2xl overflow-hidden shadow-sm card-divider">
              {payments.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      P: ${p.principal.toFixed(2)} · I: ${p.interest.toFixed(2)}
                      {p.escrow ? ` · Esc: $${p.escrow.toFixed(2)}` : ''}
                      {p.extraPrincipal ? ` · Extra: $${p.extraPrincipal.toFixed(2)}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">${p.amount.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'amortization' && <AmortizationView mortgage={mortgage} />}
    </div>
  )
}

// ── Main Screen ──────────────────────────────────────────────────────────────

type View = 'list' | 'add' | { detail: string }

export function MortgageScreen() {
  const { activePropertyId } = useAppStore()
  const [view, setView] = useState<View>('list')
  const [tick, setTick] = useState(0)

  const mortgages = getMortgagesForProperty(activePropertyId)
  const totalBalance = mortgages.reduce((s, m) => s + m.currentBalance, 0)

  if (view === 'add') {
    return (
      <div className="space-y-5 max-w-xl">
        <h1 className="text-xl font-bold text-slate-900">Add Mortgage</h1>
        <MortgageForm
          propertyId={activePropertyId}
          onSaved={() => { setView('list'); setTick(t => t + 1) }}
          onCancel={() => setView('list')}
        />
      </div>
    )
  }

  if (typeof view === 'object' && 'detail' in view) {
    const m = mortgageStore.getById(view.detail)
    if (m) {
      return (
        <MortgageDetail
          mortgage={m}
          propertyId={activePropertyId}
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
          <h1 className="text-xl font-bold text-slate-900">Mortgages</h1>
          <p className="text-sm text-slate-500 mt-0.5">Loan tracking and amortization</p>
        </div>
        <button
          onClick={() => setView('add')}
          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Add mortgage
        </button>
      </div>

      {/* Total balance summary */}
      {mortgages.length > 0 && (
        <div className="card-surface rounded-2xl shadow-sm p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Mortgage Balance</p>
            <p className="text-xl font-bold text-slate-900">${totalBalance.toLocaleString()}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-500">{mortgages.length} loan{mortgages.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Mortgage list */}
      {mortgages.length === 0 ? (
        <div className="card-surface rounded-2xl p-8 text-center">
          <TrendingDown className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No mortgages recorded yet.</p>
          <button onClick={() => setView('add')} className="mt-3 text-sm text-sky-600 font-medium hover:text-sky-700">
            + Add first mortgage
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {mortgages.map(m => {
            const paidPct = (1 - m.currentBalance / (m.originalBalance || 1)) * 100
            return (
              <button
                key={m.id}
                onClick={() => setView({ detail: m.id })}
                className="w-full card-surface rounded-2xl shadow-sm p-4 text-left hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{m.label}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-md px-1.5 py-0.5">{m.interestRate}%</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{m.lender}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-800">${m.currentBalance.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">remaining</p>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, paidPct))}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{Math.round(paidPct)}% paid down · ${m.monthlyPayment.toLocaleString()}/mo</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
