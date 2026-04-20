import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, X, Trash2, ChevronDown, ChevronUp, Droplets } from 'lucide-react'
import { cn } from '../utils/cn'
import { septicStore, getEventsForProperty } from '../lib/septicStore'
import { vendorStore } from '../lib/vendorStore'
import { VendorSelector } from '../components/VendorSelector'
import { useAppStore } from '../store/AppStoreContext'
import type { SepticEvent } from '../schemas'

function avgMonthsBetween(events: SepticEvent[]): number | null {
  if (events.length < 2) return null
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const diffs: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1].date)
    const b = new Date(sorted[i].date)
    diffs.push((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30))
  }
  return Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length)
}

interface AddModalProps {
  propertyId: string
  onSave: (e: SepticEvent) => void
  onClose: () => void
}

function AddModal({ propertyId, onSave, onClose }: AddModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [date,         setDate]         = useState(today)
  const [vendorId,     setVendorId]     = useState('')
  const [technician,   setTechnician]   = useState('')
  const [gallons,      setGallons]      = useState('')
  const [cost,         setCost]         = useState('')
  const [condition,    setCondition]    = useState('')
  const [techNotes,    setTechNotes]    = useState('')
  const [nextDate,     setNextDate]     = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    onSave({
      id: crypto.randomUUID(),
      propertyId,
      date,
      vendorId: vendorId || undefined,
      technician: technician || undefined,
      gallonsPumped: gallons ? Number(gallons) : undefined,
      cost: cost ? Number(cost) : undefined,
      conditionNotes: condition || undefined,
      techNotes: techNotes || undefined,
      nextRecommendedDate: nextDate || undefined,
    })
  }

  const inputCls = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  return (
    <div className="modal-backdrop">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Log Septic Service</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
            <VendorSelector value={vendorId} onChange={setVendorId} propertyId={propertyId} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Technician</label>
            <input value={technician} onChange={e => setTechnician(e.target.value)} placeholder="Technician name" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Gallons Pumped</label>
              <input type="number" min="0" value={gallons} onChange={e => setGallons(e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost ($)</label>
              <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tank Condition As Found</label>
            <textarea
              value={condition} onChange={e => setCondition(e.target.value)}
              rows={2} placeholder="Describe the condition found…"
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Technician Observations</label>
            <textarea
              value={techNotes} onChange={e => setTechNotes(e.target.value)}
              rows={2} placeholder="Notes from the technician…"
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Next Recommended Date</label>
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-info flex-1">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function EventCard({ event, onDelete }: { event: SepticEvent; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const vendor = event.vendorId ? vendorStore.getById(event.vendorId) : undefined

  return (
    <div className="card-surface rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {vendor ? vendor.name : event.technician ? event.technician : 'No contractor recorded'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {event.cost && (
                  <span className="text-sm font-semibold text-slate-700">${event.cost.toLocaleString()}</span>
                )}
                <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 p-2 -m-1">
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
              {event.gallonsPumped && (
                <span>{event.gallonsPumped.toLocaleString()} gallons pumped</span>
              )}
              {event.nextRecommendedDate && (
                <span>
                  Next: {new Date(event.nextRecommendedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            {event.conditionNotes && (
              <div>
                <p className="text-xs font-medium text-slate-600">Condition found:</p>
                <p className="text-xs text-slate-500">{event.conditionNotes}</p>
              </div>
            )}
            {event.techNotes && (
              <div>
                <p className="text-xs font-medium text-slate-600">Technician notes:</p>
                <p className="text-xs text-slate-500">{event.techNotes}</p>
              </div>
            )}
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function SepticScreen() {
  const { activePropertyId } = useAppStore()
  const [events, setEvents] = useState<SepticEvent[]>(() => getEventsForProperty(activePropertyId))
  const [showModal, setShowModal] = useState(false)

  function refresh() { setEvents(getEventsForProperty(activePropertyId)) }

  useEffect(() => { refresh() }, [activePropertyId])

  function handleSave(e: SepticEvent) {
    septicStore.add(e)
    refresh()
    setShowModal(false)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this service record?')) return
    septicStore.remove(id)
    refresh()
  }

  const latest = events[0]
  const avgMonths = avgMonthsBetween(events)

  // Warning: past next recommended date
  const overdue = latest?.nextRecommendedDate && new Date(latest.nextRecommendedDate) < new Date()

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Septic Service History</h1>
            <p className="text-sm text-slate-500 mt-0.5">{events.length} service{events.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-info"
          >
            <Plus className="w-4 h-4" />
            Log Service
          </button>
        </div>

        {/* Warning */}
        {overdue && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm text-amber-700">
              Next recommended service was{' '}
              {new Date(latest!.nextRecommendedDate!).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — schedule a pump-out.
            </span>
          </div>
        )}

        {/* Stats bar */}
        {events.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card-surface rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Service</p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="card-surface rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Interval</p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {avgMonths !== null ? `${avgMonths} months` : 'N/A'}
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Droplets className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-slate-500 font-medium">No service records yet.</p>
            <p className="text-sm text-slate-400">Log your septic pump-outs to track history and get reminders.</p>
          </div>
        )}

        {/* Events list */}
        <div className="space-y-3">
          {events.map(e => (
            <EventCard key={e.id} event={e} onDelete={() => handleDelete(e.id)} />
          ))}
        </div>
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
