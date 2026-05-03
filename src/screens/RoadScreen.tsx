import { useState, useEffect } from 'react'
import { Plus, X, MapPin, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { roadStore, getRoadEventsForProperty, getRoadSpendByYear, getGravelTonsByYear } from '../lib/roadStore'
import { useAppStore } from '../store/AppStoreContext'
import { useModalA11y } from '../lib/focusTrap'
import { ROAD_MAINTENANCE_TYPES } from '../types/road'
import type { RoadEvent, RoadMaintenanceTypeId } from '../types/road'

// ── Badge colors ─────────────────────────────────────────────────────────────

const BADGE_CLASS: Record<RoadMaintenanceTypeId, string> = {
  gravel_delivery:    'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  culvert_cleaning:   'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  plowing_service:    'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  washout_repair:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  vegetation_control: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  gate_maintenance:   'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  other:              'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
}

function typeLabel(id: RoadMaintenanceTypeId): string {
  return ROAD_MAINTENANCE_TYPES.find(t => t.id === id)?.label ?? id
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'gravel' | 'culvert' | 'other'

function filterEvents(events: RoadEvent[], tab: FilterTab): RoadEvent[] {
  switch (tab) {
    case 'gravel':  return events.filter(e => e.maintenanceTypeId === 'gravel_delivery')
    case 'culvert': return events.filter(e => e.maintenanceTypeId === 'culvert_cleaning' || e.maintenanceTypeId === 'washout_repair')
    case 'other':   return events.filter(e => e.maintenanceTypeId !== 'gravel_delivery' && e.maintenanceTypeId !== 'culvert_cleaning' && e.maintenanceTypeId !== 'washout_repair')
    default:        return events
  }
}

// ── Event Form (shared by Add & Edit modals) ──────────────────────────────────

interface EventFormProps {
  initial: Partial<RoadEvent>
  propertyId: string
  onSave: (e: RoadEvent) => void
  onClose: () => void
  title: string
}

function EventForm({ initial, propertyId, onSave, onClose, title }: EventFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const [maintenanceTypeId, setMaintenanceTypeId] = useState<RoadMaintenanceTypeId>(
    initial.maintenanceTypeId ?? 'gravel_delivery'
  )
  const [date,            setDate]            = useState(initial.date ?? today)
  const [vendor,          setVendor]          = useState(initial.vendor ?? '')
  const [quantity,        setQuantity]        = useState(initial.quantity != null ? String(initial.quantity) : '')
  const [areaDescription, setAreaDescription] = useState(initial.areaDescription ?? '')
  const [cost,            setCost]            = useState(initial.cost != null ? String(initial.cost) : '')
  const [notes,           setNotes]           = useState(initial.notes ?? '')
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const selectedType = ROAD_MAINTENANCE_TYPES.find(t => t.id === maintenanceTypeId)!

  function handleTypeChange(id: RoadMaintenanceTypeId) {
    setMaintenanceTypeId(id)
    if (!ROAD_MAINTENANCE_TYPES.find(t => t.id === id)?.hasQuantity) {
      setQuantity('')
    }
  }

  function handleSave() {
    if (!vendor.trim()) return
    const event: RoadEvent = {
      id:               initial.id ?? crypto.randomUUID(),
      propertyId,
      maintenanceTypeId,
      date,
      vendor:           vendor.trim(),
      quantity:         selectedType.hasQuantity && quantity ? parseFloat(quantity) : undefined,
      unit:             selectedType.hasQuantity ? selectedType.unit : undefined,
      areaDescription:  areaDescription.trim() || undefined,
      cost:             cost ? parseFloat(cost) : undefined,
      notes:            notes.trim() || undefined,
    }
    onSave(event)
  }

  const inputCls = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="road-event-form-title"
        className="rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 p-5 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="road-event-form-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Maintenance type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Maintenance Type</label>
            <select
              value={maintenanceTypeId}
              onChange={e => handleTypeChange(e.target.value as RoadMaintenanceTypeId)}
              className={inputCls}
            >
              {ROAD_MAINTENANCE_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date + Vendor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vendor *</label>
              <input
                type="text"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                placeholder="Company name"
                className={inputCls}
              />
            </div>
          </div>

          {/* Quantity (conditional) */}
          {selectedType.hasQuantity && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Quantity ({selectedType.unit})
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}

          {/* Area description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Area Description</label>
            <input
              type="text"
              value={areaDescription}
              onChange={e => setAreaDescription(e.target.value)}
              placeholder="Lower lane, first 400ft"
              className={inputCls}
            />
          </div>

          {/* Cost */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cost ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={cn(inputCls, 'resize-none')}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!vendor.trim()}
            className="btn btn-primary flex-1"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: RoadEvent
  onEdit: (e: RoadEvent) => void
  onDelete: (id: string) => void
}

function EventCard({ event, onEdit, onDelete }: EventCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dateStr = new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  })

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row: badge + date */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-medium border rounded-full px-2.5 py-0.5', BADGE_CLASS[event.maintenanceTypeId])}>
              {typeLabel(event.maintenanceTypeId)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{dateStr}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{event.vendor}</span>
          </div>

          {/* Secondary row: quantity + area */}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {event.quantity != null && (
              <span>{event.quantity} {event.unit}</span>
            )}
            {event.areaDescription && (
              <span className="italic">{event.areaDescription}</span>
            )}
          </div>

          {event.notes && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{event.notes}</p>
          )}
        </div>

        {/* Cost + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {event.cost != null && (
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
              ${event.cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(event)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Inline delete confirm */}
      {confirmDelete && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">Confirm delete?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-400 font-medium"
            >
              No
            </button>
            <button
              onClick={() => onDelete(event.id)}
              className="btn btn-danger btn-sm"
            >
              Yes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function RoadScreen() {
  const { activePropertyId } = useAppStore()
  const [events, setEvents] = useState<RoadEvent[]>(() => getRoadEventsForProperty(activePropertyId))
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState<RoadEvent | null>(null)

  function refresh() {
    setEvents(getRoadEventsForProperty(activePropertyId))
  }

  useEffect(() => { refresh() }, [activePropertyId])

  function handleAdd(e: RoadEvent) {
    roadStore.add(e)
    refresh()
    setShowAdd(false)
  }

  function handleEdit(e: RoadEvent) {
    roadStore.update(e)
    refresh()
    setEditEvent(null)
  }

  function handleDelete(id: string) {
    roadStore.remove(id)
    refresh()
  }

  const year = new Date().getFullYear()
  const spendByYear   = getRoadSpendByYear(activePropertyId)
  const gravelByYear  = getGravelTonsByYear(activePropertyId)
  const spendThisYear  = spendByYear[year]  ?? 0
  const gravelThisYear = gravelByYear[year] ?? 0

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',     label: 'All'               },
    { key: 'gravel',  label: 'Gravel'            },
    { key: 'culvert', label: 'Culvert & Drainage' },
    { key: 'other',   label: 'Other'             },
  ]

  const filtered = filterEvents(events, activeTab)

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Road &amp; Access</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{events.length} event{events.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Log Event
          </button>
        </div>

        {/* Summary cards */}
        <div className="flex gap-3 flex-wrap">
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3 shadow-sm flex-1 min-w-[140px]">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total spend {year}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              ${spendThisYear.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3 shadow-sm flex-1 min-w-[140px]">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gravel {year}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              {gravelThisYear.toLocaleString('en-US', { maximumFractionDigits: 1 })} tons
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === t.key
                  ? 'bg-green-600 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <MapPin className="w-12 h-12 text-slate-200 dark:text-slate-600 mx-auto" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No road maintenance logged.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Track gravel deliveries, culvert cleaning, plowing, and more.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
              Log First Event
            </button>
          </div>
        )}

        {/* Filtered empty state */}
        {events.length > 0 && filtered.length === 0 && (
          <div className="text-center py-10">
            <p className="text-slate-400 dark:text-slate-500 text-sm">No events match this filter.</p>
          </div>
        )}

        {/* Event list */}
        <div className="space-y-3">
          {filtered.map(e => (
            <EventCard
              key={e.id}
              event={e}
              onEdit={setEditEvent}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <EventForm
          title="Log Road Event"
          initial={{}}
          propertyId={activePropertyId}
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Edit modal */}
      {editEvent && (
        <EventForm
          title="Edit Road Event"
          initial={editEvent}
          propertyId={activePropertyId}
          onSave={handleEdit}
          onClose={() => setEditEvent(null)}
        />
      )}
    </>
  )
}
