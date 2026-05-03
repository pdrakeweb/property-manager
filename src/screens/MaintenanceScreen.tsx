import { useState, useRef } from 'react'
import {
  CheckCircle2, Clock, AlertTriangle, Zap, ChevronDown,
  ChevronUp, Calendar, DollarSign, User, RepeatIcon, X, Camera,
  ImageIcon, Wrench, Plus, CalendarPlus, Loader2, RefreshCw,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { costStore, getYTDSpend } from '../lib/costStore'
import { VendorSelector } from '../components/VendorSelector'
import { useAppStore } from '../store/AppStoreContext'
import {
  customTaskStore,
  getActiveTasks,
  markTaskDone,
  setTaskDelay,
  setTaskRecurrence,
} from '../lib/maintenanceStore'
import { localIndex } from '../lib/localIndex'
import { useIndexVersion } from '../lib/useIndexVersion'
import { useModalA11y } from '../lib/focusTrap'
import { useToast } from '../components/Toast'
import { PhotoLightbox } from '../components/photos/PhotoLightbox'
import { syncAllToCalendar } from '../lib/calendarClient'
import type { DryRunResult } from '../lib/calendarClient'
import { DryRunModal } from '../components/DryRunModal'
import { TaskCalendarChip } from '../components/TaskCalendarChip'
import { SystemLabelCombobox } from '../components/SystemLabelCombobox'
import { getValidToken, isDev } from '../auth/oauth'

import type { MaintenanceTask, Priority } from '../types'
import type { EventPhoto } from '../schemas'

type Tab = 'due' | 'upcoming' | 'history'

function priorityConfig(p: Priority) {
  return {
    critical: { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
    high:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
    medium:   { label: 'Medium',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
    low:      { label: 'Low',      bg: 'bg-slate-100 dark:bg-slate-700',  text: 'text-slate-600 dark:text-slate-400',  dot: 'bg-slate-300 dark:bg-slate-500'  },
  }[p]
}

function sourceLabel(s: MaintenanceTask['source']) {
  return {
    'ha-trigger':   { label: 'HA Usage', icon: Zap,   color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800'          },
    'manufacturer': { label: 'Mfr.',     icon: Clock,  color: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50'    },
    'ai-suggested': { label: 'AI',       icon: Zap,    color: 'text-violet-600 bg-violet-50 border-violet-100' },
    'manual':       { label: 'Manual',   icon: User,   color: 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50'    },
  }[s]
}

const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Cash'             },
  { value: 'check', label: 'Check'            },
  { value: 'card',  label: 'Card/Credit'      },
  { value: 'ach',   label: 'ACH/Bank Transfer'},
] as const

const RECURRENCE_OPTIONS = [
  { value: '',           label: 'None (one-time)'  },
  { value: 'Weekly',     label: 'Weekly'           },
  { value: 'Monthly',    label: 'Monthly'          },
  { value: 'Quarterly',  label: 'Quarterly'        },
  { value: 'Annually',   label: 'Annually'         },
  { value: 'Every 90 days', label: 'Every 90 days' },
  { value: 'Semi-annual',   label: 'Semi-annual'   },
]

const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

// ── Photo role helpers ────────────────────────────────────────────────────────

function photoRoleStyle(role: EventPhoto['role']) {
  return {
    before:  'bg-green-600 text-white border-sky-600',
    after:   'bg-emerald-600 text-white border-emerald-600',
    general: 'bg-slate-50 dark:bg-slate-800/500 text-white border-slate-500',
  }[role]
}

function photoRoleBadge(role: EventPhoto['role']) {
  return {
    before:  'bg-green-600/80 text-white',
    after:   'bg-emerald-600/80 text-white',
    general: 'bg-slate-600/70 text-white',
  }[role]
}

// ── Recurrence helper ─────────────────────────────────────────────────────────

function nextRecurrenceDate(currentDue: string, recurrence: string): string {
  const d = new Date(currentDue + 'T12:00:00')
  switch (recurrence) {
    case 'Weekly':        d.setDate(d.getDate() + 7); break
    case 'Monthly':       d.setMonth(d.getMonth() + 1); break
    case 'Quarterly':     d.setMonth(d.getMonth() + 3); break
    case 'Semi-annual':   d.setMonth(d.getMonth() + 6); break
    case 'Annually':      d.setFullYear(d.getFullYear() + 1); break
    case 'Every 90 days': d.setDate(d.getDate() + 90); break
    default:              return ''
  }
  return d.toISOString().slice(0, 10)
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
  // Centralised modal a11y: focus trap, Escape-to-close, focus restore.
  // Replaces the previous ad-hoc Escape handler that lived here.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)
  const toast = useToast()

  function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setPhotos(prev => [...prev, {
          id: crypto.randomUUID(), role: photoRole,
          localDataUrl: ev.target!.result as string,
        }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
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
    // Mark the task completed in localIndex
    markTaskDone(task.id)
    // If recurring, create the next occurrence
    if (task.recurrence) {
      const nextDue = nextRecurrenceDate(task.dueDate, task.recurrence)
      if (nextDue) {
        customTaskStore.add({
          ...task,
          id: `task_${Date.now()}`,
          dueDate: nextDue,
          status: 'upcoming',
        })
      }
    }
    toast.success(`Marked complete: ${task.title}`)
    onConfirm()
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="done-modal-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="done-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Mark Complete</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 p-1 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed"><span className="font-medium">{task.title}</span></p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Completion Date</label>
            <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Actual Cost ($)</label>
            <input type="number" min="0" step="0.01" value={actualCost} onChange={e => setActualCost(e.target.value)} placeholder="0.00" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contractor / Company</label>
            <input value={doneContractor} onChange={e => setDoneContractor(e.target.value)} placeholder="Name or company" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Invoice / Reference #</label>
            <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-2024-0042" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vendor (from directory)</label>
            <VendorSelector value={selectedVendorId} onChange={setSelectedVendorId} propertyId={propertyId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Labor Warranty Expires</label>
            <input type="date" value={laborWarrantyExpiry} onChange={e => setLaborWarrantyExpiry(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
            <textarea value={doneNotes} onChange={e => setDoneNotes(e.target.value)} rows={2} placeholder="Any notes about the work done…" className={cn(inp, 'resize-none')} />
          </div>
          {/* Photos */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Photos</label>
            <div className="flex gap-1 mb-2">
              {(['before', 'after', 'general'] as const).map(role => (
                <button key={role} type="button" onClick={() => setPhotoRole(role)}
                  className={cn('flex-1 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors',
                    photoRole === role ? photoRoleStyle(role) : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700 bg-white dark:bg-slate-800'
                  )}>
                  {role}
                </button>
              ))}
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoFiles} />
            <button type="button" onClick={() => photoInputRef.current?.click()}
              className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" />Add {photoRole} photo
            </button>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {photos.map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square bg-slate-100 dark:bg-slate-700">
                    {p.localDataUrl
                      ? <img src={p.localDataUrl} alt={p.role} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                    }
                    <div className={cn('absolute bottom-0 inset-x-0 text-[10px] font-semibold text-center py-0.5 capitalize', photoRoleBadge(p.role))}>{p.role}</div>
                    <button type="button" onClick={() => setPhotos(prev => prev.filter(ph => ph.id !== p.id))}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={handleConfirm} className="btn btn-primary flex-1">Mark Complete</button>
        </div>
      </div>
    </div>
  )
}

// ── Delay Modal ───────────────────────────────────────────────────────────────

interface DelayModalProps {
  task: MaintenanceTask
  onSaved: (newDueDate: string) => void
  onClose: () => void
}

function DelayModal({ task, onSaved, onClose }: DelayModalProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [customDate, setCustomDate] = useState('')
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function applyDelay(newDate: string) {
    onSaved(newDate)
  }

  function addDays(n: number): string {
    const today = new Date().toISOString().slice(0, 10)
    const base  = task.dueDate > today ? task.dueDate : today
    const d = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delay-modal-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="delay-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Delay Task</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">{task.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Current due date: {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        {/* Quick buttons */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '+3 days', days: 3 },
            { label: '+1 week', days: 7 },
            { label: '+1 month', days: 30 },
          ].map(({ label, days }) => (
            <button key={days} onClick={() => applyDelay(addDays(days))}
              className="py-2.5 text-sm font-medium bg-slate-100 dark:bg-slate-700 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-300 rounded-xl transition-colors">
              {label}
            </button>
          ))}
        </div>
        {/* Custom date */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Or pick a date</label>
          <div className="flex gap-2">
            <input type="date" value={customDate} min={today} onChange={e => setCustomDate(e.target.value)} className={cn(inp, 'flex-1')} />
            <button onClick={() => customDate && applyDelay(customDate)} disabled={!customDate}
              className="btn btn-primary">
              Set
            </button>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-block">Cancel</button>
      </div>
    </div>
  )
}

// ── Schedule Modal (recurrence editor) ───────────────────────────────────────

interface ScheduleModalProps {
  task: MaintenanceTask
  onSaved: (newDueDate: string, recurrence: string) => void
  onClose: () => void
}

function ScheduleModal({ task, onSaved, onClose }: ScheduleModalProps) {
  const [dueDate,    setDueDate]    = useState(task.dueDate)
  const [recurrence, setRecurrence] = useState(task.recurrence ?? '')
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function save() {
    onSaved(dueDate, recurrence)
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="schedule-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Schedule Task</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">{task.title}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recurrence</label>
            <select value={recurrence} onChange={e => setRecurrence(e.target.value)} className={inp}>
              {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={save} className="btn btn-primary flex-1">Save Schedule</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Task Modal ────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  propertyId: string
  onSaved: () => void
  onClose: () => void
}

function AddTaskModal({ propertyId, onSaved, onClose }: AddTaskModalProps) {
  const [title,      setTitle]      = useState('')
  const [system,     setSystem]     = useState('')
  const [dueDate,    setDueDate]    = useState(new Date().toISOString().slice(0, 10))
  const [priority,   setPriority]   = useState<Priority>('medium')
  const [estCost,    setEstCost]    = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [notes,      setNotes]      = useState('')
  // useModalA11y handles Escape, focus trap, and focus restore — replaces the
  // ad-hoc Escape handler that used to live in this component.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function save() {
    if (!title.trim()) return
    customTaskStore.add({
      id:            `task_${Date.now()}`,
      propertyId,
      title:         title.trim(),
      systemLabel:   system.trim() || 'General',
      categoryId:    'service_record',
      dueDate,
      priority,
      status:        'upcoming',
      source:        'manual',
      estimatedCost: estCost ? Number(estCost) : undefined,
      recurrence:    recurrence || undefined,
      notes:         notes.trim() || undefined,
    })
    onSaved()
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="add-task-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Maintenance Task</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clean gutters" className={inp} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">System / Category</label>
            <SystemLabelCombobox value={system} onChange={setSystem} propertyId={propertyId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={inp}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Estimated Cost ($)</label>
            <input type="number" min="0" step="1" value={estCost} onChange={e => setEstCost(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recurrence</label>
            <select value={recurrence} onChange={e => setRecurrence(e.target.value)} className={inp}>
              {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any relevant notes…" className={cn(inp, 'resize-none')} />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={!title.trim()} className="btn btn-primary flex-1">
            Add Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Event History Card ────────────────────────────────────────────────────────

function EventHistoryCard({ event }: { event: ReturnType<typeof costStore.getAll>[number] }) {
  const [expanded, setExpanded] = useState(false)
  const beforePhotos  = event.photos?.filter(p => p.role === 'before')  ?? []
  const afterPhotos   = event.photos?.filter(p => p.role === 'after')   ?? []
  const generalPhotos = event.photos?.filter(p => p.role === 'general') ?? []
  const hasPhotos = (event.photos?.length ?? 0) > 0
  // Lightbox state — index into the full event.photos array, not a sub-bucket.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const allPhotos = event.photos ?? []

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-md px-2 py-0.5">{event.categoryId.replace(/_/g, ' ')}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {new Date(event.completionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {hasPhotos && (
                <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                  <ImageIcon className="w-3 h-3" />{event.photos!.length}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1.5">{event.taskTitle}</p>
            {event.contractor && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">by {event.contractor}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.cost !== undefined && (
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">${event.cost.toLocaleString()}</span>
            )}
            {hasPhotos && (
              <button onClick={() => setExpanded(e => !e)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 p-2 -m-1 rounded-lg">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
        {event.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{event.notes}</p>}
      </div>

      {expanded && hasPhotos && (
        <div className="border-t border-slate-100 dark:border-slate-700/50 px-4 py-4 space-y-4">
          {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
            <div>
              <p className="section-title mb-2">Before / After</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Before', photos: beforePhotos, cls: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
                  { label: 'After',  photos: afterPhotos,  cls: 'text-emerald-600', border: 'border-emerald-200' },
                ].map(({ label, photos, cls, border }) => (
                  <div key={label}>
                    <p className={cn('text-[11px] font-semibold mb-1.5 uppercase tracking-wide', cls)}>{label}</p>
                    {photos.length > 0
                      ? photos.map(p => {
                          const idxInAll = allPhotos.indexOf(p)
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => setLightboxIdx(idxInAll)}
                              aria-label={`Open ${label.toLowerCase()} photo`}
                              className={cn('block w-full rounded-xl overflow-hidden border mb-2 hover:opacity-90 transition-opacity', border)}
                            >
                              {p.localDataUrl
                                ? <img src={p.localDataUrl} alt={label} className="w-full object-cover" />
                                : <div className="aspect-square bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600">
                                    <ImageIcon className="w-6 h-6" />
                                  </div>
                              }
                            </button>
                          )
                        })
                      : <div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
          {generalPhotos.length > 0 && (
            <div>
              <p className="section-title mb-2">General</p>
              <div className="grid grid-cols-3 gap-2">
                {generalPhotos.map(p => {
                  const idxInAll = allPhotos.indexOf(p)
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setLightboxIdx(idxInAll)}
                      aria-label="Open photo"
                      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
                    >
                      {p.localDataUrl
                        ? <img src={p.localDataUrl} alt="General" className="w-full aspect-square object-cover" />
                        : <div className="w-full aspect-square bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <PhotoLightbox photos={allPhotos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────

// Bridges MaintenanceTask (legacy type) to the IndexRecord-based TaskCalendarChip
function TaskCalendarChipWrapper({ task, propertyId }: { task: MaintenanceTask; propertyId: string }) {
  const record = localIndex.getById(task.id)
  if (!record) return null
  return <TaskCalendarChip task={record} propertyId={propertyId} />
}

interface TaskCardProps {
  task: MaintenanceTask
  propertyId: string
}

// Mutations write through the localIndex/syncBus pipeline, so the parent
// MaintenanceScreen re-renders via `useIndexVersion` without needing an
// explicit onMutate callback.
function TaskCard({ task: initialTask, propertyId }: TaskCardProps) {
  const [task,           setTask]           = useState(initialTask)
  const [expanded,       setExpanded]       = useState(false)
  const [done,           setDone]           = useState(false)
  const [showDoneModal,  setShowDoneModal]  = useState(false)
  const [showDelayModal, setShowDelayModal] = useState(false)
  const [showSchedModal, setShowSchedModal] = useState(false)
  const pconf   = priorityConfig(task.priority)
  const src     = sourceLabel(task.source)
  const SrcIcon = src.icon

  function handleDelayed(newDueDate: string) {
    setTaskDelay(task, newDueDate)
    setTask(t => ({ ...t, dueDate: newDueDate }))
    setShowDelayModal(false)
  }

  function handleScheduled(newDueDate: string, recurrence: string) {
    setTaskDelay(task, newDueDate)
    setTaskRecurrence({ ...task, dueDate: newDueDate }, recurrence)
    setTask(t => ({ ...t, dueDate: newDueDate, recurrence: recurrence || undefined }))
    setShowSchedModal(false)
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 opacity-60">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <span className="text-sm text-slate-600 dark:text-slate-400 line-through flex-1">{task.title}</span>
        <button onClick={() => setDone(false)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">Undo</button>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', pconf.dot)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{task.title}</p>
                <button onClick={() => setExpanded(e => !e)}
                  className="shrink-0 p-2 -m-1 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 rounded-lg">
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-2 py-0.5">{task.systemLabel}</span>
                <span className={cn('text-xs font-medium rounded-md px-2 py-0.5', pconf.bg, pconf.text)}>{pconf.label}</span>
                <span className={cn('text-xs font-medium border rounded-full px-2 py-0.5 flex items-center gap-1', src.color)}>
                  <SrcIcon className="w-2.5 h-2.5" />{src.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Due {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {task.estimatedCost !== undefined && task.estimatedCost > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />Est. ${task.estimatedCost.toLocaleString()}
                  </span>
                )}
                {task.recurrence && (
                  <span className="flex items-center gap-1">
                    <RepeatIcon className="w-3 h-3" />{task.recurrence}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <TaskCalendarChipWrapper task={task} propertyId={propertyId} />
              </div>
            </div>
          </div>
          {expanded && (task.contractor || task.notes) && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 space-y-2 ml-5">
              {task.contractor && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-medium">Contractor:</span> {task.contractor}</p>}
              {task.notes && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-medium">Notes:</span> {task.notes}</p>}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700/50 flex">
          <button onClick={() => setShowDoneModal(true)}
            className="flex-1 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />Mark Done
          </button>
          <div className="w-px bg-slate-100 dark:bg-slate-700" />
          <button onClick={() => setShowDelayModal(true)}
            className="flex-1 py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            Delay
          </button>
          <div className="w-px bg-slate-100 dark:bg-slate-700" />
          <button onClick={() => setShowSchedModal(true)}
            className="flex-1 py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            Schedule
          </button>
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
      {showDelayModal && (
        <DelayModal
          task={task}
          onSaved={handleDelayed}
          onClose={() => setShowDelayModal(false)}
        />
      )}
      {showSchedModal && (
        <ScheduleModal
          task={task}
          onSaved={handleScheduled}
          onClose={() => setShowSchedModal(false)}
        />
      )}
    </>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function MaintenanceScreen() {
  const { activePropertyId, properties } = useAppStore()
  const [tab,           setTab]           = useState<Tab>('due')
  // Subscribes to localIndex mutations — replaces the old `tick` counter
  // that forced a full subtree remount via `key={tick}`. The value itself
  // isn't used; calling the hook is what triggers re-render.
  useIndexVersion()
  const [showAddTask,   setShowAddTask]   = useState(false)
  const [calSyncing,    setCalSyncing]    = useState(false)
  const [dryRunResult,  setDryRunResult]  = useState<DryRunResult | null>(null)

  async function handleCalendarSync() {
    const propertyName = properties.find(p => p.id === activePropertyId)?.name ?? activePropertyId
    if (isDev()) {
      setCalSyncing(true)
      try {
        const result = await syncAllToCalendar('dev_token', activePropertyId, propertyName, true)
        setDryRunResult(result as DryRunResult)
      } finally {
        setCalSyncing(false)
      }
      return
    }
    setCalSyncing(true)
    try {
      const token = await getValidToken()
      if (!token) return
      await syncAllToCalendar(token, activePropertyId, propertyName)
    } finally {
      setCalSyncing(false)
    }
  }

  const ytdSpend = getYTDSpend(activePropertyId)

  // Use getActiveTasks so overrides and recalculated statuses are applied
  const allActive  = getActiveTasks(activePropertyId)
  const overdue    = allActive.filter(t => t.status === 'overdue')
  const due        = allActive.filter(t => t.status === 'due')
  const upcoming   = allActive.filter(t => t.status === 'upcoming')

  const dueTasks      = [...overdue, ...due]
  const upcomingTasks = upcoming
  const totalCostDue  = dueTasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)

  // Completed events from store (most recent first), filtered by property.
  // Dedupe by id — older localStorage states sometimes contain duplicate seeds.
  const completedEvents = Array.from(
    new Map(
      costStore.getAll()
        .filter(e => e.propertyId === activePropertyId)
        .map(e => [e.id, e]),
    ).values(),
  ).sort((a, b) => b.completionDate.localeCompare(a.completionDate))

  const historyCount = completedEvents.length

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'due',      label: 'Due Now',  count: dueTasks.length      },
    { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length  },
    { id: 'history',  label: 'History',  count: historyCount          },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Maintenance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {dueTasks.length} tasks due · ${totalCostDue.toLocaleString()} estimated cost
          </p>
        </div>
        <button
          type="button"
          onClick={handleCalendarSync}
          disabled={calSyncing}
          title={isDev() ? 'Preview calendar sync (dev mode)' : 'Sync all tasks to Google Calendar'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors shrink-0 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50"
        >
          {calSyncing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : isDev()
              ? <CalendarPlus className="w-3.5 h-3.5" />
              : <RefreshCw className="w-3.5 h-3.5" />
          }
          {isDev() ? 'Preview Calendar' : 'Sync Calendar'}
        </button>
      </div>
      {dryRunResult && <DryRunModal result={dryRunResult} onClose={() => setDryRunResult(null)} />}

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
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300')}>
            {t.label}
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold',
              tab === t.id ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-200 text-slate-500 dark:text-slate-400')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'due' && (
        <div className="space-y-3">
          {overdue.length > 0 && <p className="text-xs font-semibold uppercase text-red-500 tracking-wide">Overdue</p>}
          {overdue.map(task => <TaskCard key={task.id} task={task} propertyId={activePropertyId} />)}
          {due.length > 0 && <p className="text-xs font-semibold uppercase text-orange-500 tracking-wide mt-4">Due Soon</p>}
          {due.map(task => <TaskCard key={task.id} task={task} propertyId={activePropertyId} />)}
          {dueTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
              <p className="text-sm font-medium">All caught up!</p>
            </div>
          )}
        </div>
      )}

      {tab === 'upcoming' && (
        <div className="space-y-3">
          {upcomingTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
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
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <Wrench className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="text-sm font-medium">No service history yet.</p>
              <p className="text-xs mt-1">Mark tasks as done to build your history.</p>
            </div>
          )}

          {completedEvents.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-emerald-600 tracking-wide">Completed ({completedEvents.length})</p>
              {completedEvents.map(event => <EventHistoryCard key={event.id} event={event} />)}
            </>
          )}
        </div>
      )}

      {/* Add task */}
      <button onClick={() => setShowAddTask(true)}
        className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" />Add maintenance task
      </button>

      {showAddTask && (
        <AddTaskModal
          propertyId={activePropertyId}
          onSaved={() => { /* re-render driven by useIndexVersion */ }}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  )
}
