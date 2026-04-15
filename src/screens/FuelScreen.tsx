import { useState, useEffect } from 'react'
import { Plus, X, Droplets } from 'lucide-react'
import { cn } from '../utils/cn'
import { fuelStore, getDeliveriesForProperty } from '../lib/fuelStore'
import { vendorStore } from '../lib/vendorStore'
import { VendorSelector } from '../components/VendorSelector'
import { useAppStore } from '../store/AppStoreContext'
import type { FuelDelivery } from '../schemas'

type Tab = 'overview' | 'charts'
type FuelType = FuelDelivery['fuelType']

const FUEL_TYPES: { value: FuelType; label: string; color: string }[] = [
  { value: 'propane',     label: 'Propane',      color: 'bg-sky-500'    },
  { value: 'heating_oil', label: 'Heating Oil',  color: 'bg-orange-500' },
  { value: 'diesel',      label: 'Diesel',       color: 'bg-slate-500'  },
  { value: 'gasoline',    label: 'Gasoline',     color: 'bg-amber-500'  },
  { value: 'other',       label: 'Other',        color: 'bg-violet-500' },
]

const FUEL_BADGE: Record<FuelType, string> = {
  propane:     'bg-sky-50 text-sky-700 border-sky-100',
  heating_oil: 'bg-orange-50 text-orange-700 border-orange-100',
  diesel:      'bg-slate-50 text-slate-700 border-slate-200',
  gasoline:    'bg-amber-50 text-amber-700 border-amber-100',
  other:       'bg-violet-50 text-violet-700 border-violet-100',
}

function fuelLabel(type: FuelType): string {
  return FUEL_TYPES.find(t => t.value === type)?.label ?? type
}

// ── SVG line chart ───────────────────────────────────────────────────────────

function PriceTrendChart({ deliveries }: { deliveries: FuelDelivery[] }) {
  const sorted = [...deliveries].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400">
        Need at least 2 deliveries to show a price trend.
      </div>
    )
  }

  const W = 360, H = 160, PAD = 36
  const prices = sorted.map(d => d.pricePerGallon)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const range = maxP - minP || 0.01

  const pts = sorted.map((d, i) => ({
    px: PAD + (i / (sorted.length - 1)) * (W - PAD * 2),
    py: H - PAD - ((d.pricePerGallon - minP) / range) * (H - PAD * 2),
    date: d.date,
    price: d.pricePerGallon,
  }))

  const polyline = pts.map(p => `${p.px},${p.py}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.5, 1].map(t => {
        const y = H - PAD - t * (H - PAD * 2)
        const val = minP + t * range
        return (
          <g key={t}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              ${val.toFixed(2)}
            </text>
          </g>
        )
      })}
      <polyline points={polyline} fill="none" stroke="#0ea5e9" strokeWidth="2" />
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

// ── CSS bar chart ────────────────────────────────────────────────────────────

function GallonsBarChart({ deliveries, fuelType }: { deliveries: FuelDelivery[]; fuelType: FuelType }) {
  // Group by month (last 12 months)
  const months: string[] = []
  const d = new Date()
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }

  const byMonth: Record<string, number> = {}
  for (const m of months) byMonth[m] = 0
  for (const del of deliveries) {
    if (del.fuelType !== fuelType) continue
    const key = del.date.slice(0, 7)
    if (key in byMonth) byMonth[key] += del.gallons
  }

  const data = months.map(m => ({
    label: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }),
    value: byMonth[m],
  }))
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const color = FUEL_TYPES.find(t => t.value === fuelType)?.color ?? 'bg-sky-500'

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map(item => (
        <div key={item.label} className="flex flex-col items-center flex-1 min-w-0">
          {item.value > 0 && (
            <div className="text-[9px] text-slate-400 mb-0.5 truncate">{Math.round(item.value)}</div>
          )}
          <div
            className={cn('w-full rounded-t transition-all', color)}
            style={{ height: `${Math.max(item.value > 0 ? 4 : 0, (item.value / maxVal) * 100)}%` }}
          />
          <div className="text-[9px] text-slate-400 mt-0.5 truncate">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Add Delivery Modal ───────────────────────────────────────────────────────

interface AddModalProps {
  propertyId: string
  onSave: (d: FuelDelivery) => void
  onClose: () => void
}

function AddModal({ propertyId, onSave, onClose }: AddModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [date,       setDate]       = useState(today)
  const [fuelType,   setFuelType]   = useState<FuelType>('propane')
  const [gallons,    setGallons]    = useState('')
  const [pricePerGal,setPricePerGal] = useState('')
  const [totalCost,  setTotalCost]  = useState('')
  const [vendorId,   setVendorId]   = useState('')
  const [notes,      setNotes]      = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function recalcTotal(g: string, p: string) {
    const gal = parseFloat(g)
    const prc = parseFloat(p)
    if (!isNaN(gal) && !isNaN(prc)) {
      setTotalCost((gal * prc).toFixed(2))
    }
  }

  function handleGallons(v: string) {
    setGallons(v)
    recalcTotal(v, pricePerGal)
  }

  function handlePrice(v: string) {
    setPricePerGal(v)
    recalcTotal(gallons, v)
  }

  function handleSave() {
    if (!gallons || !pricePerGal) return
    onSave({
      id: crypto.randomUUID(),
      propertyId,
      date,
      fuelType,
      gallons: parseFloat(gallons),
      pricePerGallon: parseFloat(pricePerGal),
      totalCost: totalCost ? parseFloat(totalCost) : parseFloat(gallons) * parseFloat(pricePerGal),
      vendorId: vendorId || undefined,
      notes: notes || undefined,
    })
  }

  const inputCls = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add Delivery</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
              <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Type</label>
              <select
                value={fuelType}
                onChange={e => setFuelType(e.target.value as FuelType)}
                className={inputCls}
              >
                {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Gallons *</label>
              <input
                type="number" min="0" step="0.1" value={gallons}
                onChange={e => handleGallons(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">$/Gallon *</label>
              <input
                type="number" min="0" step="0.001" value={pricePerGal}
                onChange={e => handlePrice(e.target.value)}
                placeholder="0.000"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Total Cost</label>
              <input
                type="number" min="0" step="0.01" value={totalCost}
                onChange={e => setTotalCost(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
            <VendorSelector value={vendorId} onChange={setVendorId} propertyId={propertyId} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} className={cn(inputCls, 'resize-none')}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!gallons || !pricePerGal}
            className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Annual Totals Card ───────────────────────────────────────────────────────

function AnnualSummary({ deliveries }: { deliveries: FuelDelivery[] }) {
  const year = new Date().getFullYear()
  const thisYear = deliveries.filter(d => d.date.startsWith(String(year)))

  const byType: Partial<Record<FuelType, { gallons: number; cost: number }>> = {}
  for (const d of thisYear) {
    if (!byType[d.fuelType]) byType[d.fuelType] = { gallons: 0, cost: 0 }
    byType[d.fuelType]!.gallons += d.gallons
    byType[d.fuelType]!.cost += d.totalCost
  }

  const entries = Object.entries(byType) as [FuelType, { gallons: number; cost: number }][]
  if (entries.length === 0) return null

  return (
    <div className="card-surface rounded-2xl shadow-sm px-4 py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{year} Annual Totals</p>
      <div className="space-y-2">
        {entries.map(([type, totals]) => (
          <div key={type} className="flex items-center justify-between">
            <span className={cn('text-xs font-medium border rounded-full px-2.5 py-0.5', FUEL_BADGE[type])}>
              {fuelLabel(type)}
            </span>
            <div className="text-right">
              <span className="text-sm font-semibold text-slate-700">${totals.cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              <span className="text-xs text-slate-400 ml-1.5">{totals.gallons.toFixed(0)} gal</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export function FuelScreen() {
  const { activePropertyId } = useAppStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [deliveries, setDeliveries] = useState<FuelDelivery[]>(() => getDeliveriesForProperty(activePropertyId))
  const [showModal, setShowModal] = useState(false)
  const [chartFuelType, setChartFuelType] = useState<FuelType>('propane')
  const [chartMode, setChartMode] = useState<'gallons' | 'price'>('gallons')

  function refresh() { setDeliveries(getDeliveriesForProperty(activePropertyId)) }

  useEffect(() => { refresh() }, [activePropertyId])

  function handleSave(d: FuelDelivery) {
    fuelStore.add(d)
    refresh()
    setShowModal(false)
  }

  const chartDeliveries = deliveries.filter(d => d.fuelType === chartFuelType)

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fuel Deliveries</h1>
            <p className="text-sm text-slate-500 mt-0.5">{deliveries.length} delivery{deliveries.length !== 1 ? 'deliveries' : ''}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Delivery
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['overview', 'charts'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'toggle-active' : 'toggle-inactive',
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <AnnualSummary deliveries={deliveries} />

            {deliveries.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <Droplets className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="text-slate-500 font-medium">No fuel deliveries recorded.</p>
                <p className="text-sm text-slate-400">Track propane, heating oil, and other fuel deliveries.</p>
              </div>
            )}

            <div className="space-y-3">
              {deliveries.map(d => {
                const vendor = d.vendorId ? vendorStore.getById(d.vendorId) : undefined
                return (
                  <div key={d.id} className="card-surface rounded-2xl shadow-sm px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-xs font-medium border rounded-full px-2.5 py-0.5', FUEL_BADGE[d.fuelType])}>
                            {fuelLabel(d.fuelType)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {vendor && <span className="text-xs text-slate-400">{vendor.name}</span>}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                          <span>{d.gallons.toFixed(1)} gal</span>
                          <span>${d.pricePerGallon.toFixed(3)}/gal</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-700 shrink-0">
                        ${d.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {d.notes && <p className="text-xs text-slate-400 mt-1.5 ml-0">{d.notes}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Charts tab */}
        {tab === 'charts' && (
          <div className="space-y-4">
            {/* Fuel type + chart mode selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Type</label>
                <select
                  value={chartFuelType}
                  onChange={e => setChartFuelType(e.target.value as FuelType)}
                  className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
                >
                  {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Chart</label>
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                  {(['gallons', 'price'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setChartMode(m)}
                      className={cn(
                        'flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors',
                        chartMode === m ? 'toggle-active' : 'toggle-inactive',
                      )}
                    >
                      {m === 'gallons' ? 'Volume' : 'Price'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Gallons bar chart */}
            {chartMode === 'gallons' && (
              <div className="card-surface rounded-2xl shadow-sm px-4 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Gallons per Month — {fuelLabel(chartFuelType)}</p>
                <GallonsBarChart deliveries={deliveries} fuelType={chartFuelType} />
              </div>
            )}

            {/* Price trend line chart */}
            {chartMode === 'price' && (
              <div className="card-surface rounded-2xl shadow-sm px-4 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Price Trend — {fuelLabel(chartFuelType)} ($/gal)</p>
                <PriceTrendChart deliveries={chartDeliveries} />
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
