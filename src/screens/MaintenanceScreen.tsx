import { useState, useRef, useEffect } from 'react'
import {
  CheckCircle2, Clock, AlertTriangle, Zap, ChevronDown,
  ChevronUp, Calendar, DollarSign, User, RepeatIcon, X, Camera,
  ImageIcon, Wrench,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { MAINTENANCE_TASKS, SERVICE_RECORDS } from '../data/mockData'
import { costStore, getYTDSpend } from '../lib/costStore'
import { VendorSelector } from '../components/VendorSelector'
import { useAppStore } from '../store/AppStoreContext'
import type { MaintenanceTask, Priority } from '../types'
import type { EventPhoto } from '../schemas'

type Tab = 'due' | 'upcoming' | 'history'

function priorityConfig(p: Priority) {
  return {
    critical: { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
    high:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
    medium:   { label: 'Medium',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
    low:      { label: 'Low',      bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-300'  },
  }[p]
}

function sourceLabel(s: MaintenanceTask['source']) {
  return {
    'ha-trigger':   { label: 'HA Usage', icon: Zap,   color: 'text-sky-600 bg-sky-50 border-sky-100'          },
    'manufacturer': { label: 'Mfr.',     icon: Clock,  color: 'text-slate-600 bg-slate-50 border-slate-100'    },
    'ai-suggested': { label: 'AI',       icon: Zap,    color: 'text-violet-600 bg-violet-50 border-violet-100' },
    'manual':       { label: 'Manual',   icon: User,   color: 'text-slate-500 bg-slate-50 border-slate-100'    },
  }[s]
}

const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Cash'             },
  { value: 'check', label: 'Check'            },
  { value: 'card',  label: 'Card/Credit'      },
  { value: 'ach',   label: 'ACH/Bank Transfer'},
] as const

// ── Photo role chip colors ────────────────────────────────────────────────────

function photoRoleStyle(role: EventPhoto['role']) {
  return {
    before:  'bg-sky-600 text-white border-sky-600',
    after:   'bg-emerald-600 text-white border-emerald-600',
    general: 'bg-slate-500 text-white border-slate-500',
  }[role]
}

function photoRoleBadge(role: EventPhoto['role']) {
  return {
    before:  'bg-sky-600/80 text-white',
    after:   'bg-emerald-600/80 text-white',
    general: 'bg-slate-600/70 text-white',
  }[role]
}

// ── Mark Done Modal ───────────────────────────────────────────────────────────

interface DoneModalProps {
  task: MaintenanceTask
  propertyId: string
  onConfirm: () => void
  onClose: () => void
}

function DoneModal({ task, propertyId, onConfirm, onClose }: DoneModalProps) {
  const [completionDate,      setCompletionDate]      = useState(new Date().toISOString().split('T')[0])
  const [actualCost,          setActualCost]          = useState('')
  const [paymentMethod,       setPaymentMethod]       = useState('')
  const [invoiceRef,          setInvoiceRef]          = useState('')
  const [selectedVendorId,    setSelectedVendorId]    = useState('')
  const [doneContractor,      setDoneContractor]      = useState(task.contractor ?? '')
  const [laborWarrantyExpiry, setLaborWarrantyExpiry] = useState('')
  const [doneNotes,           setDoneNotes]           = useState('')
  const [photos,              setPhotos]              = useState<EventPhoto[]>([])
  const [photoRole,           setPhotoRole]           = useState<EventPhoto['role']>('after')

  const photoInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setPhotos(prev => [...prev, {
          id: crypto.randomUUID(),
          role: photoRole,
          localDataUrl: ev.target!.result as string,
        }])
      }
      reader.readAsDataURL(file)
    })
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function removePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  function handleConfirm() {
    costStore.add({
      id: crypto.randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      categoryId: task.categoryId,
      propertyId: task.propertyId,
      completionDate,
      cost: actualCost ? Number(actualCost) : undefined,
      paymentMethod: (paymentMethod as 'cash' | 'check' | 'card' | 'ach') || undefined,
      invoiceRef: invoiceRef || undefined,
      vendorId: selectedVendorId || undefined,
      contractor: doneContractor || undefined,
      laborWarrantyExpiry: laborWarrantyExpiry || undefined,
      notes: doneNotes || undefined,
      photos: photos.length > 0 ? photos : undefined,
    })
    onConfirm()
  }

  const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Mark Complete</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-medium">{task.title}</span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Completion Date</label>
            <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} className={inp} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Actual Cost ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={actualCost} onChange={e => setActualCost(e.target.value)}
              placeholder="0.00" className={inp}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contractor / Company</label>
            <input
              value={doneContractor} onChange={e => setDoneContractor(e.target.value)}
              placeholder="Name or company" className={inp}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={cn(inp, 'bg-white')}>
              <option value="">Select…</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Invoice / Reference #</label>
            <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-2024-0042" className={inp} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vendor (from directory)</label>
            <VendorSelector value={selectedVendorId} onChange={setSelectedVendorId} propertyId={propertyId} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Labor Warranty Expires</label>
            <input type="date" value={laborWarrantyExpiry} onChange={e => setLaborWarrantyExpiry(e.target.value)} className={inp} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={doneNotes} onChange={e => setDoneNotes(e.target.value)}
              rows={2} placeholder="Any notes about the work done…"
              className={cn(inp, 'resize-none')}
            />
          </div>

          {/* ── Photos ───────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Photos</label>

            {/* Role selector */}
            <div className="flex gap-1 mb-2">
              {(['before', 'after', 'general'] as const).map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setPhotoRole(role)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors',
                    photoRole === role
                      ? photoRoleStyle(role)
                      : 'text-slate-600 border-slate-200 hover:border-sky-300 bg-white',
                  )}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Capture button */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoFiles}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Add {photoRole} photo
            </button>

            {/* Thumbnails */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {photos.map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square">
                    <img src={p.localDataUrl} alt={p.role} className="w-full h-full object-cover" />
                    <div className={cn('absolute bottom-0 inset-x-0 text-[10px] font-semibold text-center py-0.5 capitalize', photoRoleBadge(p.role))}>
                      {p.role}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium">
            Cancel
          </button>
          <button onClick={handleConfirm} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium">
            Mark Complete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Completed Event History Card ──────────────────────────────────────────────

function EventHistoryCard({ event }: { event: ReturnType<typeof costStore.getAll>[number] }) {
  const [expanded, setExpanded] = useState(false)
  const beforePhotos  = event.photos?.filter(p => p.role === 'before')  ?? []
  const afterPhotos   = event.photos?.filter(p => p.role === 'after')   ?? []
  const generalPhotos = event.photos?.filter(p => p.role === 'general') ?? []
  const hasPhotos = (event.photos?.length ?? 0) > 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">
                {event.categoryId.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(event.completionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {hasPhotos && (
                <span className="flex items-center gap-0.5 text-xs text-sky-600">
                  <ImageIcon className="w-3 h-3" />
                  {event.photos!.length}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 mt-1.5">{event.taskTitle}</p>
            {event.contractor && (
              <p className="text-xs text-slate-400 mt-0.5">by {event.contractor}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.cost !== undefined && (
              <span className="text-sm font-semibold text-slate-700">${event.cost.toLocaleString()}</span>
            )}
            {hasPhotos && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-slate-400 hover:text-slate-600 p-2 -m-1 rounded-lg"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
        {event.notes && (
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{event.notes}</p>
        )}
      </div>

      {/* Before / After photo comparison */}
      {expanded && hasPhotos && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">

          {/* Before + After side-by-side */}
          {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Before / After</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-sky-600 mb-1.5 uppercase tracking-wide">Before</p>
                  {beforePhotos.length > 0 ? (
                    <div className="space-y-2">
                      {beforePhotos.map(p => (
                        <div key={p.id} className="rounded-xl overflow-hidden border border-sky-200">
                          <img src={p.localDataUrl} alt="Before" className="w-full object-cover" />
                          {p.caption && <p className="text-[10px] text-slate-500 px-2 py-1">{p.caption}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-emerald-600 mb-1.5 uppercase tracking-wide">After</p>
                  {afterPhotos.length > 0 ? (
                    <div className="space-y-2">
                      {afterPhotos.map(p => (
                        <div key={p.id} className="rounded-xl overflow-hidden border border-emerald-200">
                          <img src={p.localDataUrl} alt="After" className="w-full object-cover" />
                          {p.caption && <p className="text-[10px] text-slate-500 px-2 py-1">{p.caption}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* General photos gallery */}
          {generalPhotos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">General</p>
              <div className="grid grid-cols-3 gap-2">
                {generalPhotos.map(p => (
                  <div key={p.id} className="rounded-xl overflow-hidden border border-slate-200">
                    <img src={p.localDataUrl} alt="General" className="w-full aspect-square object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, propertyId }: { task: MaintenanceTask; propertyId: string }) {
  const [expanded,      setExpanded]      = useState(false)
  const [done,          setDone]          = useState(false)
  const [showDoneModal, setShowDoneModal] = useState(false)
  const pconf = priorityConfig(task.priority)
  const src   = sourceLabel(task.source)
  const SrcIcon = src.icon

  if (done) {
    return (
      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 opacity-60">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <span className="text-sm text-slate-600 line-through flex-1">{task.title}</span>
        <button onClick={() => setDone(false)} className="text-xs text-slate-400 hover:text-slate-600">Undo</button>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', pconf.dot)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{task.title}</p>
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="shrink-0 p-2 -m-1 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-slate-500 bg-slate-100 rounded-md px-2 py-0.5">{task.systemLabel}</span>
                <span className={cn('text-xs font-medium rounded-md px-2 py-0.5', pconf.bg, pconf.text)}>{pconf.label}</span>
                <span className={cn('text-xs font-medium border rounded-full px-2 py-0.5 flex items-center gap-1', src.color)}>
                  <SrcIcon className="w-2.5 h-2.5" />
                  {src.label}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 mt-2.5 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {task.estimatedCost !== undefined && task.estimatedCost > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Est. ${task.estimatedCost.toLocaleString()}
                  </span>
                )}
                {task.recurrence && (
                  <span className="flex items-center gap-1">
                    <RepeatIcon className="w-3 h-3" />
                    {task.recurrence}
                  </span>
                )}
              </div>
            </div>
          </div>

          {expanded && (task.contractor || task.notes) && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 ml-5">
              {task.contractor && (
                <p className="text-xs text-slate-600"><span className="font-medium">Contractor:</span> {task.contractor}</p>
              )}
              {task.notes && (
                <p className="text-xs text-slate-600"><span className="font-medium">Notes:</span> {task.notes}</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 flex">
          <button
            onClick={() => setShowDoneModal(true)}
            className="flex-1 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark Done
          </button>
          <div className="w-px bg-slate-100" />
          <button className="flex-1 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">Delay</button>
          <div className="w-px bg-slate-100" />
          <button className="flex-1 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">Schedule</button>
        </div>
      </div>

      {showDoneModal && (
        <DoneModal
          task={task}
          propertyId={propertyId}
          onConfirm={() => { setDone(true); setShowDoneModal(false) }}
          onClose={() => setShowDoneModal(false)}
        />
      )}
    </>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function MaintenanceScreen() {
  const { activePropertyId } = useAppStore()
  const [tab,  setTab]  = useState<Tab>('due')
  const [tick, setTick] = useState(0)
  void tick

  const ytdSpend = getYTDSpend(activePropertyId)

  const overdue  = MAINTENANCE_TASKS.filter(t => t.status === 'overdue')
  const due      = MAINTENANCE_TASKS.filter(t => t.status === 'due')
  const upcoming = MAINTENANCE_TASKS.filter(t => t.status === 'upcoming')

  const dueTasks      = [...overdue, ...due]
  const upcomingTasks = upcoming
  const totalCostDue  = dueTasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)

  // Completed events from store (most recent first)
  const completedEvents = costStore
    .getAll()
    .filter(e => e.propertyId === activePropertyId)
    .sort((a, b) => b.completionDate.localeCompare(a.completionDate))

  const historyCount = SERVICE_RECORDS.length + completedEvents.length

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'due',      label: 'Due Now',  count: dueTasks.length  },
    { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length },
    { id: 'history',  label: 'History',  count: historyCount     },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Maintenance</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {dueTasks.length} tasks due · ${totalCostDue.toLocaleString()} estimated cost
        </p>
      </div>

      {/* YTD Spend */}
      {ytdSpend > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">YTD Maintenance Spend</p>
            <p className="text-xl font-bold text-emerald-800">${ytdSpend.toLocaleString()}</p>
          </div>
          <p className="text-xs text-emerald-600">{new Date().getFullYear()}</p>
        </div>
      )}

      {/* Alert: overdue items */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700">
            {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'} — {overdue.map(t => t.title).join(', ')}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-semibold',
              tab === t.id ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-500',
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'due' && (
        <div className="space-y-3">
          {overdue.length > 0 && (
            <p className="text-xs font-semibold uppercase text-red-500 tracking-wide">Overdue</p>
          )}
          {overdue.map(task => <TaskCard key={task.id} task={task} propertyId={activePropertyId} />)}

          {due.length > 0 && (
            <p className="text-xs font-semibold uppercase text-orange-500 tracking-wide mt-4">Due Soon</p>
          )}
          {due.map(task => <TaskCard key={task.id} task={task} propertyId={activePropertyId} />)}

          {dueTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
              <p className="text-sm font-medium">All caught up!</p>
            </div>
          )}
        </div>
      )}

      {tab === 'upcoming' && (
        <div className="space-y-3">
          {upcomingTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="text-sm font-medium">No upcoming tasks scheduled.</p>
            </div>
          )}
          {upcomingTasks.map(task => <TaskCard key={task.id} task={task} propertyId={activePropertyId} />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">

          {historyCount === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Wrench className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="text-sm font-medium">No service history yet.</p>
              <p className="text-xs mt-1">Mark tasks as done to build your history.</p>
            </div>
          )}

          {/* Completed events with before/after photos */}
          {completedEvents.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-emerald-600 tracking-wide">
                Completed ({completedEvents.length})
              </p>
              {completedEvents.map(event => (
                <EventHistoryCard
                  key={event.id}
                  event={event}
                />
              ))}
              {/* Force re-render when events are added */}
              {void setTick}
            </>
          )}

          {/* Legacy service records */}
          {SERVICE_RECORDS.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mt-2">Service Records</p>
              {SERVICE_RECORDS.map(record => (
                <div key={record.id} className="bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">
                          {record.systemLabel}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1.5">{record.workDescription}</p>
                      {record.contractor && (
                        <p className="text-xs text-slate-400 mt-1">by {record.contractor}</p>
                      )}
                    </div>
                    {record.totalCost !== undefined && (
                      <span className="text-sm font-semibold text-slate-700 shrink-0">
                        ${record.totalCost.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {historyCount === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">No history yet</p>
            </div>
          )}
        </div>
      )}

      {/* Add task button */}
      <button className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors">
        + Add maintenance task
      </button>

    </div>
  )
}
