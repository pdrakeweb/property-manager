import { useState, useRef } from 'react'
import {
  Plus, X, ExternalLink, CheckCircle2,
  Camera, Upload, Sparkles, Loader2, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'
import {
  taxAssessmentStore, taxPaymentStore,
  getAssessmentsForProperty, getPaymentsForProperty,
} from '../lib/taxStore'
import { useDocumentExtraction, confidenceRing } from '../hooks/useDocumentExtraction'
import type { TaxAssessment, TaxPayment } from '../schemas'

// ── Extraction field IDs ─────────────────────────────────────────────────────

const ASSESSMENT_FIELD_IDS = ['year', 'assessedLand', 'assessedImprovement', 'totalAssessed', 'marketValue']
const PAYMENT_FIELD_IDS    = ['year', 'installment', 'dueDate', 'amount']

const ASSESSMENT_PROMPT =
  'This is a property tax assessment notice. Extract: tax year, assessed land value, assessed improvement value, total assessed value, and market/appraised value. Return confidence high/medium/low for each field. If a field is not visible return value "" with confidence "low".'

const PAYMENT_PROMPT =
  'This is a property tax bill or payment notice. Extract: tax year, installment number (1 or 2), due date (YYYY-MM-DD format), and amount due. Return confidence high/medium/low for each field. If a field is not visible return value "" with confidence "low".'

// ── Shared UI helpers ────────────────────────────────────────────────────────

const baseInput = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition-all placeholder:text-slate-400'

function DocumentCapturePanel({
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

  // Push extracted values up when done
  const prevDone = useRef(false)
  if (aiState === 'done' && !prevDone.current) {
    prevDone.current = true
    const vals: Record<string, string> = {}
    for (const [k, v] of Object.entries(extracted)) vals[k] = v.value
    onExtracted(vals)
  }
  if (aiState !== 'done') prevDone.current = false

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <span className="flex items-center gap-1 text-xs text-sky-600">
            <Sparkles className="w-3 h-3" />
            AI extraction
          </span>
        </div>

        {/* Hidden inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => handleFilesChosen(e.target.files, true)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*,application/pdf"
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

        {/* AI status */}
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
            <span className="font-medium flex-1">
              {aiState === 'extracting' && 'Extracting…'}
              {aiState === 'done'       && 'Extraction complete — review fields below'}
              {aiState === 'error'      && (aiError || 'Extraction failed — fill manually')}
            </span>
            {(aiState === 'done' || aiState === 'error') && (
              <button
                onClick={clearExtraction}
                className="text-xs opacity-70 hover:opacity-100 shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Thumbnails */}
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

// ── Assessment Form ──────────────────────────────────────────────────────────

function AssessmentForm({
  propertyId,
  onSaved,
  onCancel,
}: {
  propertyId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    year: String(new Date().getFullYear()),
    assessedLand: '',
    assessedImprovement: '',
    totalAssessed: '',
    marketValue: '',
    notes: '',
  })
  const [extracted, setExtracted] = useState<Record<string, { confidence: 'high' | 'medium' | 'low' }>>({})

  function applyExtracted(extracted: Record<string, string>) {
    setVals(prev => ({ ...prev, ...extracted }))
  }

  function handleSave() {
    const a: TaxAssessment = {
      id:                  `tax_a_${Date.now()}`,
      propertyId,
      year:                parseInt(vals.year) || new Date().getFullYear(),
      assessedLand:        parseFloat(vals.assessedLand) || 0,
      assessedImprovement: parseFloat(vals.assessedImprovement) || 0,
      totalAssessed:       parseFloat(vals.totalAssessed) || 0,
      marketValue:         vals.marketValue ? parseFloat(vals.marketValue) : undefined,
      notes:               vals.notes || undefined,
    }
    taxAssessmentStore.add(a)
    onSaved()
  }

  const field = (id: string, label: string, type = 'text', placeholder = '') => {
    const conf = extracted[id]?.confidence
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
        <input
          type={type}
          value={vals[id] ?? ''}
          placeholder={placeholder}
          onChange={e => setVals(prev => ({ ...prev, [id]: e.target.value }))}
          className={cn(baseInput, conf ? confidenceRing(conf) : '')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DocumentCapturePanel
        title="Photograph or Upload Assessment Notice"
        fieldIds={ASSESSMENT_FIELD_IDS}
        prompt={ASSESSMENT_PROMPT}
        onExtracted={v => { applyExtracted(v); setExtracted(Object.fromEntries(Object.keys(v).map(k => [k, { confidence: 'high' as const }]))) }}
      />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Assessment Details</h3>
        {field('year',                'Tax Year',              'number', '2024')}
        {field('assessedLand',        'Assessed Land Value',   'number', '0.00')}
        {field('assessedImprovement', 'Assessed Improvements', 'number', '0.00')}
        {field('totalAssessed',       'Total Assessed Value',  'number', '0.00')}
        {field('marketValue',         'Market / Appraised Value', 'number', '0.00')}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
          <textarea
            rows={2}
            value={vals.notes}
            onChange={e => setVals(prev => ({ ...prev, notes: e.target.value }))}
            className={cn(baseInput, 'resize-none')}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200">
          Cancel
        </button>
        <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">
          Save Assessment
        </button>
      </div>
    </div>
  )
}

// ── Payment Form ─────────────────────────────────────────────────────────────

function PaymentForm({
  propertyId,
  onSaved,
  onCancel,
}: {
  propertyId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    year:        String(new Date().getFullYear()),
    installment: '1',
    dueDate:     '',
    paidDate:    '',
    amount:      '',
    penalty:     '',
    notes:       '',
  })

  function handleSave() {
    const p: TaxPayment = {
      id:          `tax_p_${Date.now()}`,
      propertyId,
      year:        parseInt(vals.year) || new Date().getFullYear(),
      installment: (parseInt(vals.installment) === 2 ? 2 : 1) as 1 | 2,
      dueDate:     vals.dueDate,
      paidDate:    vals.paidDate || undefined,
      amount:      parseFloat(vals.amount) || 0,
      penalty:     vals.penalty ? parseFloat(vals.penalty) : undefined,
      notes:       vals.notes || undefined,
    }
    taxPaymentStore.add(p)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <DocumentCapturePanel
        title="Photograph or Upload Tax Bill"
        fieldIds={PAYMENT_FIELD_IDS}
        prompt={PAYMENT_PROMPT}
        onExtracted={v => setVals(prev => ({ ...prev, ...v }))}
      />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Payment Details</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Tax Year</label>
            <input type="number" value={vals.year} onChange={e => setVals(p => ({ ...p, year: e.target.value }))} className={baseInput} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Installment</label>
            <select value={vals.installment} onChange={e => setVals(p => ({ ...p, installment: e.target.value }))} className={cn(baseInput, 'bg-white')}>
              <option value="1">1st (~Feb 10)</option>
              <option value="2">2nd (~Jul 10)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Due Date</label>
            <input type="date" value={vals.dueDate} onChange={e => setVals(p => ({ ...p, dueDate: e.target.value }))} className={baseInput} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Paid Date</label>
            <input type="date" value={vals.paidDate} onChange={e => setVals(p => ({ ...p, paidDate: e.target.value }))} className={baseInput} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Amount ($)</label>
            <input type="number" step="0.01" value={vals.amount} onChange={e => setVals(p => ({ ...p, amount: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Penalty ($)</label>
            <input type="number" step="0.01" value={vals.penalty} onChange={e => setVals(p => ({ ...p, penalty: e.target.value }))} className={baseInput} placeholder="0.00" />
          </div>
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
          Save Payment
        </button>
      </div>
    </div>
  )
}

// ── Main Screen ──────────────────────────────────────────────────────────────

type Tab    = 'assessments' | 'payments'
type Adding = 'assessment'  | 'payment'  | null

export function TaxScreen() {
  const { activePropertyId } = useAppStore()
  const [tab,    setTab]    = useState<Tab>('payments')
  const [adding, setAdding] = useState<Adding>(null)
  const [tick,   setTick]   = useState(0)
  const refresh = () => setTick(t => t + 1)

  const assessments = getAssessmentsForProperty(activePropertyId)
  const payments    = getPaymentsForProperty(activePropertyId)

  const today = new Date().toISOString().slice(0, 10)

  if (adding === 'assessment') {
    return (
      <div className="space-y-5 max-w-xl">
        <h1 className="text-xl font-bold text-slate-900">Add Assessment</h1>
        <AssessmentForm
          propertyId={activePropertyId}
          onSaved={() => { setAdding(null); refresh() }}
          onCancel={() => setAdding(null)}
        />
      </div>
    )
  }

  if (adding === 'payment') {
    return (
      <div className="space-y-5 max-w-xl">
        <h1 className="text-xl font-bold text-slate-900">Add Tax Payment</h1>
        <PaymentForm
          propertyId={activePropertyId}
          onSaved={() => { setAdding(null); refresh() }}
          onCancel={() => setAdding(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl" key={tick}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Property Tax</h1>
          <p className="text-sm text-slate-500 mt-0.5">Wayne County, Ohio — semi-annual installments</p>
        </div>
        <a
          href="https://auditor.waynecountyohio.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          County Auditor
        </a>
      </div>

      {/* Tab bar */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {(['payments', 'assessments'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-medium py-2 rounded-lg transition-colors capitalize',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Payments tab ── */}
      {tab === 'payments' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setAdding('payment')}
              className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add payment
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-500">No tax payments recorded yet.</p>
              <button onClick={() => setAdding('payment')} className="mt-3 text-sm text-sky-600 font-medium hover:text-sky-700">
                + Add first payment
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
              {payments.map(p => {
                const overdue   = !p.paidDate && p.dueDate < today
                const unpaid    = !p.paidDate && p.dueDate >= today
                const totalDue  = p.amount + (p.penalty ?? 0)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {p.year} · Installment {p.installment}
                        </span>
                        {overdue && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                            Overdue
                          </span>
                        )}
                        {unpaid && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                            Due {new Date(p.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {p.paidDate && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Paid
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Due {new Date(p.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        {p.paidDate && ` · Paid ${new Date(p.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                        {p.penalty ? ` · +$${p.penalty.toLocaleString()} penalty` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-sm font-bold tabular-nums', overdue ? 'text-red-600' : 'text-slate-800')}>
                        ${totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Assessments tab ── */}
      {tab === 'assessments' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setAdding('assessment')}
              className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium bg-sky-50 border border-sky-100 rounded-lg px-3 py-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add assessment
            </button>
          </div>

          {assessments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-500">No assessments recorded yet.</p>
              <button onClick={() => setAdding('assessment')} className="mt-3 text-sm text-sky-600 font-medium hover:text-sky-700">
                + Add first assessment
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-medium">Year</th>
                    <th className="px-4 py-3 text-right font-medium">Total Assessed</th>
                    <th className="px-4 py-3 text-right font-medium">YoY Δ</th>
                    <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">Market Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assessments.map((a, idx) => {
                    const prev  = assessments[idx + 1]
                    const delta = prev ? a.totalAssessed - prev.totalAssessed : null
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{a.year}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          ${a.totalAssessed.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {delta === null ? (
                            <span className="text-slate-300">—</span>
                          ) : delta > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-red-600">
                              <ChevronUp className="w-3 h-3" />
                              ${delta.toLocaleString()}
                            </span>
                          ) : delta < 0 ? (
                            <span className="flex items-center justify-end gap-1 text-emerald-600">
                              <ChevronDown className="w-3 h-3" />
                              ${Math.abs(delta).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">No change</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden sm:table-cell">
                          {a.marketValue ? `$${a.marketValue.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
