import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, X, Trash2, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'
import { cn } from '../utils/cn'
import { wellTestStore, getTestsForProperty } from '../lib/wellTestStore'
import { useAppStore } from '../store/AppStoreContext'
import { useModalA11y } from '../lib/focusTrap'
import type { WellTest, WellTestParameter } from '../schemas'

type Tab = 'list' | 'trends'
type PassFail = WellTestParameter['passFail']

const RESULT_COLOR = {
  pass:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  fail:     'bg-red-50 text-red-700 border-red-200',
  advisory: 'bg-amber-50 text-amber-700 border-amber-200',
}
const RESULT_DOT = {
  pass:     'bg-emerald-500',
  fail:     'bg-red-500',
  advisory: 'bg-amber-400',
}

const PRESET_PARAMS: Omit<WellTestParameter, 'value'>[] = [
  { name: 'Total Coliform', unit: 'CFU/100mL', passFail: 'pass' },
  { name: 'E. coli',        unit: 'CFU/100mL', passFail: 'pass' },
  { name: 'Nitrates',       unit: 'mg/L',       passFail: 'pass' },
  { name: 'pH',             unit: 'pH units',   passFail: 'pass' },
  { name: 'Hardness',       unit: 'mg/L CaCO₃', passFail: 'pass' },
  { name: 'Arsenic',        unit: 'µg/L',       passFail: 'pass' },
  { name: 'Manganese',      unit: 'µg/L',       passFail: 'pass' },
  { name: 'Iron',           unit: 'mg/L',       passFail: 'pass' },
]

function autoOverall(params: WellTestParameter[]): WellTest['overallResult'] {
  if (params.some(p => p.passFail === 'fail')) return 'fail'
  if (params.some(p => p.passFail === 'advisory')) return 'advisory'
  return 'pass'
}

function nextTestDateFrom(dateStr: string): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + 11)
  return d.toISOString().split('T')[0]
}

// ── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length === 0) return null
  if (data.length === 1) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400">
        Only one data point — need more tests to show a trend.
      </div>
    )
  }

  const W = 360, H = 180, PAD = 36
  const vals = data.map(d => d.value)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  const range = maxVal - minVal || 1

  const pts = data.map((d, i) => ({
    px: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    py: H - PAD - ((d.value - minVal) / range) * (H - PAD * 2),
    date: d.date,
    value: d.value,
  }))
  const polyline = pts.map(p => `${p.px},${p.py}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Grid lines */}
      {[0, 0.5, 1].map(t => {
        const y = H - PAD - t * (H - PAD * 2)
        const val = minVal + t * range
        return (
          <g key={t}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              {val.toFixed(1)}
            </text>
          </g>
        )
      })}
      {/* Polyline */}
      <polyline points={polyline} fill="none" stroke="#0ea5e9" strokeWidth="2" />
      {/* Dots + date labels */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.px} cy={p.py} r="4" fill="#0ea5e9" />
          <text
            x={p.px}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
            fontSize="9"
            fill="#94a3b8"
          >
            {new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Add Test Modal ───────────────────────────────────────────────────────────

interface AddModalProps {
  propertyId: string
  onSave: (t: WellTest) => void
  onClose: () => void
}

function AddModal({ propertyId, onSave, onClose }: AddModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [date,         setDate]        = useState(today)
  const [lab,          setLab]         = useState('')
  const [technician,   setTechnician]  = useState('')
  const [nextTestDate, setNextTestDate] = useState(nextTestDateFrom(today))
  const [notes,        setNotes]       = useState('')
  const [overrideResult, setOverrideResult] = useState<WellTest['overallResult'] | ''>('')
  const [params, setParams] = useState<WellTestParameter[]>(
    PRESET_PARAMS.map(p => ({ ...p, value: '' }))
  )
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function setParam(i: number, field: keyof WellTestParameter, val: string) {
    setParams(ps => ps.map((p, j) => j === i ? { ...p, [field]: val } : p))
  }

  function addParam() {
    setParams(ps => [...ps, { name: '', value: '', unit: '', passFail: 'pass' }])
  }

  function removeParam(i: number) {
    setParams(ps => ps.filter((_, j) => j !== i))
  }

  function handleDateChange(d: string) {
    setDate(d)
    setNextTestDate(nextTestDateFrom(d))
  }

  function handleSave() {
    const filled = params.filter(p => p.name.trim())
    const overall = overrideResult || autoOverall(filled)
    onSave({
      id: crypto.randomUUID(),
      propertyId,
      date,
      lab: lab || undefined,
      technician: technician || undefined,
      parameters: filled,
      overallResult: overall,
      notes: notes || undefined,
      nextTestDate: nextTestDate || undefined,
    })
  }

  const pfOptions: { value: PassFail; label: string; color: string }[] = [
    { value: 'pass',     label: 'Pass',     color: 'text-emerald-600' },
    { value: 'fail',     label: 'Fail',     color: 'text-red-600'     },
    { value: 'advisory', label: 'Advisory', color: 'text-amber-600'   },
  ]

  const inputCls = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="well-test-modal-title"
        className="modal-surface rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="well-test-modal-title" className="text-base font-semibold text-slate-900">Add Well Test</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Test Date *</label>
            <input type="date" value={date} max={today} onChange={e => handleDateChange(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Next Test Date</label>
            <input type="date" value={nextTestDate} onChange={e => setNextTestDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lab</label>
            <input value={lab} onChange={e => setLab(e.target.value)} placeholder="Lab name" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Technician</label>
            <input value={technician} onChange={e => setTechnician(e.target.value)} placeholder="Name" className={inputCls} />
          </div>
        </div>

        {/* Parameters */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">Parameters</label>
            <button onClick={addParam} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-0.5">
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {params.map((p, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <input
                  value={p.name} onChange={e => setParam(i, 'name', e.target.value)}
                  placeholder="Parameter" className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  value={p.value} onChange={e => setParam(i, 'value', e.target.value)}
                  placeholder="Value" className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  value={p.unit} onChange={e => setParam(i, 'unit', e.target.value)}
                  placeholder="Unit" className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <select
                  value={p.passFail} onChange={e => setParam(i, 'passFail', e.target.value as PassFail)}
                  className="text-xs input-surface rounded-lg px-2 py-2"
                >
                  {pfOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => removeParam(i)} className="text-slate-300 hover:text-red-400 pt-2 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Override result */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Overall Result (auto: {autoOverall(params.filter(p => p.name.trim()))})
          </label>
          <select
            value={overrideResult}
            onChange={e => setOverrideResult(e.target.value as WellTest['overallResult'] | '')}
            className={inputCls}
          >
            <option value="">Auto-calculate</option>
            <option value="pass">Pass</option>
            <option value="advisory">Advisory</option>
            <option value="fail">Fail</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-info flex-1">
            Save Test
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Test Detail Card ─────────────────────────────────────────────────────────

function TestCard({ test, onDelete }: { test: WellTest; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const failing = test.parameters.filter(p => p.passFail === 'fail')

  return (
    <div className="card-surface rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', RESULT_DOT[test.overallResult])} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {new Date(test.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                {test.lab && <p className="text-xs text-slate-400 mt-0.5">{test.lab}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-xs font-semibold border rounded-full px-2.5 py-0.5', RESULT_COLOR[test.overallResult])}>
                  {test.overallResult.charAt(0).toUpperCase() + test.overallResult.slice(1)}
                </span>
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="text-slate-400 hover:text-slate-600 p-2 -m-1"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {failing.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {failing.map(p => (
                  <span key={p.name} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
                    {p.name}: {p.value} {p.unit}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="pb-1.5 font-medium">Parameter</th>
                  <th className="pb-1.5 font-medium">Value</th>
                  <th className="pb-1.5 font-medium">Unit</th>
                  <th className="pb-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {test.parameters.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1 text-slate-700 font-medium">{p.name}</td>
                    <td className="py-1 text-slate-600 font-mono">{p.value}</td>
                    <td className="py-1 text-slate-500">{p.unit}</td>
                    <td className="py-1">
                      <span className={cn(
                        'font-semibold',
                        p.passFail === 'pass'     ? 'text-emerald-600' :
                        p.passFail === 'fail'     ? 'text-red-600'     :
                        'text-amber-600',
                      )}>
                        {p.passFail.charAt(0).toUpperCase() + p.passFail.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {test.notes && <p className="mt-2 text-xs text-slate-500">{test.notes}</p>}
            {test.nextTestDate && (
              <p className="mt-1 text-xs text-slate-400">
                Next test recommended: {new Date(test.nextTestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            <button
              onClick={onDelete}
              className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3 h-3" />
              Delete test
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export function WellTestScreen() {
  const { activePropertyId } = useAppStore()
  const [tab, setTab] = useState<Tab>('list')
  const [tests, setTests] = useState<WellTest[]>(() => getTestsForProperty(activePropertyId))
  const [showModal, setShowModal] = useState(false)
  const [trendParam, setTrendParam] = useState('')

  function refresh() { setTests(getTestsForProperty(activePropertyId)) }

  useEffect(() => { refresh() }, [activePropertyId])

  function handleSave(t: WellTest) {
    wellTestStore.add(t)
    refresh()
    setShowModal(false)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this test record?')) return
    wellTestStore.remove(id)
    refresh()
  }

  // Warning: last test > 11 months ago
  const latest = tests[0]
  const monthsSinceLastTest = latest
    ? (Date.now() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    : Infinity
  const showWarning = monthsSinceLastTest > 11

  // Trend tab: collect all unique parameter names across tests
  const allParamNames = Array.from(new Set(tests.flatMap(t => t.parameters.map(p => p.name)))).sort()

  const trendData = trendParam
    ? tests
        .map(t => {
          const param = t.parameters.find(p => p.name === trendParam)
          if (!param) return null
          const num = parseFloat(param.value)
          if (isNaN(num)) return null
          return { date: t.date, value: num }
        })
        .filter((x): x is { date: string; value: number } => x !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
    : []

  const trendParamIsNonNumeric = trendParam && trendData.length === 0 &&
    tests.some(t => t.parameters.find(p => p.name === trendParam))

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Well Water Tests</h1>
            <p className="text-sm text-slate-500 mt-0.5">{tests.length} test{tests.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-info"
          >
            <Plus className="w-4 h-4" />
            Add Test
          </button>
        </div>

        {/* Warning */}
        {showWarning && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm text-amber-700">
              {latest
                ? `Last test was ${Math.floor(monthsSinceLastTest)} months ago — annual testing recommended.`
                : 'No tests recorded yet. Annual well water testing is recommended.'}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['list', 'trends'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'toggle-active' : 'toggle-inactive',
              )}
            >
              {t === 'list' ? 'Test History' : 'Trends'}
            </button>
          ))}
        </div>

        {/* Tab: List */}
        {tab === 'list' && (
          <div className="space-y-3">
            {tests.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <FlaskConical className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="text-slate-500 font-medium">No test records yet.</p>
                <p className="text-sm text-slate-400">Add your first well water test result.</p>
              </div>
            )}
            {tests.map(t => (
              <TestCard key={t.id} test={t} onDelete={() => handleDelete(t.id)} />
            ))}
          </div>
        )}

        {/* Tab: Trends */}
        {tab === 'trends' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Select Parameter</label>
              <select
                value={trendParam}
                onChange={e => setTrendParam(e.target.value)}
                className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
              >
                <option value="">Choose a parameter…</option>
                {allParamNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {!trendParam && (
              <div className="text-center py-12 text-slate-400 text-sm">
                Select a parameter to see its trend over time.
              </div>
            )}

            {trendParamIsNonNumeric && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                Parameter values are not numeric — cannot plot a trend for this parameter.
              </div>
            )}

            {trendData.length > 0 && (
              <div className="card-surface rounded-2xl shadow-sm px-4 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">{trendParam}</p>
                <LineChart data={trendData} />
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <AddModal
          propertyId={activePropertyId}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
