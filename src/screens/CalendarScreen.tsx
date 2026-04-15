import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, X, CheckCircle2, Plus, Clock,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { MAINTENANCE_TASKS } from '../data/mockData'
import { costStore } from '../lib/costStore'
import { customTaskStore, getAllCustomTasks } from '../lib/maintenanceStore'
import { VendorSelector } from '../components/VendorSelector'
import { useAppStore } from '../store/AppStoreContext'
import type { MaintenanceTask, Priority } from '../types'
import type { CompletedEvent } from '../schemas'

// ── Calendar helpers ──────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay() // 0 = Sunday
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ── Task color helpers ────────────────────────────────────────────────────────

function taskDotBg(task: MaintenanceTask, today: string): string {
  if (task.status === 'completed') return 'bg-emerald-500'
  if (task.status === 'overdue' || task.dueDate < today) return 'bg-red-500'
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  if (task.dueDate <= week) return 'bg-amber-400'
  return 'bg-sky-500'
}

function priorityConfig(p: Priority) {
  return {
    critical: { label: 'Critical', dot: 'bg-red-500',    badge: 'text-red-700 bg-red-50 border-red-200'         },
    high:     { label: 'High',     dot: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
    medium:   { label: 'Medium',   dot: 'bg-amber-400',  badge: 'text-amber-700 bg-amber-50 border-amber-200'   },
    low:      { label: 'Low',      dot: 'bg-slate-300',  badge: 'text-slate-600 bg-slate-50 border-slate-200'   },
  }[p]
}

// ── Mark Done Modal ───────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Cash'             },
  { value: 'check', label: 'Check'            },
  { value: 'card',  label: 'Card/Credit'      },
  { value: 'ach',   label: 'ACH/Bank Transfer'},
] as const

interface DoneModalProps {
  task: MaintenanceTask
  onConfirm: () => void
  onClose: () => void
}

function DoneModal({ task, onConfirm, onClose }: DoneModalProps) {
  const [date,       setDate]       = useState(task.dueDate)
  const [cost,       setCost]       = useState('')
  const [contractor, setContractor] = useState(task.contractor ?? '')
  const [vendorId,   setVendorId]   = useState('')
  const [payment,    setPayment]    = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [notes,      setNotes]      = useState('')

  const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  function confirm() {
    costStore.add({
      id: crypto.randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      categoryId: task.categoryId,
      propertyId: task.propertyId,
      completionDate: date,
      cost: cost ? Number(cost) : undefined,
      paymentMethod: (payment as 'cash' | 'check' | 'card' | 'ach') || undefined,
      invoiceRef: invoiceRef || undefined,
      vendorId: vendorId || undefined,
      contractor: contractor || undefined,
      notes: notes || undefined,
    })
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Mark Complete</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-slate-700">{task.title}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Completion Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Actual Cost ($)</label>
            <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contractor</label>
            <input value={contractor} onChange={e => setContractor(e.target.value)} placeholder="Name or company" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vendor (from directory)</label>
            <VendorSelector value={vendorId} onChange={setVendorId} propertyId={task.propertyId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
            <select value={payment} onChange={e => setPayment(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Invoice / Ref</label>
            <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-0042" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={cn(inp, 'resize-none')} />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-200">Cancel</button>
          <button onClick={confirm} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700">Mark Complete</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Task Modal ─────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  propertyId: string
  prefilledDate: string
  onClose: () => void
  onSaved: () => void
}

function AddTaskModal({ propertyId, prefilledDate, onClose, onSaved }: AddTaskModalProps) {
  const [title,    setTitle]    = useState('')
  const [system,   setSystem]   = useState('')
  const [dueDate,  setDueDate]  = useState(prefilledDate)
  const [priority, setPriority] = useState<Priority>('medium')

  const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  function save() {
    if (!title.trim()) return
    customTaskStore.add({
      id: `custom_${Date.now()}`,
      propertyId,
      title: title.trim(),
      systemLabel: system.trim() || 'General',
      categoryId: 'service_record',
      dueDate,
      priority,
      status: 'upcoming',
      source: 'manual',
    })
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Add Task</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Task Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Clean gutters" className={inp}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">System / Category</label>
            <input value={system} onChange={e => setSystem(e.target.value)} placeholder="HVAC, Generator…" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={inp}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
          <button
            onClick={save}
            disabled={!title.trim()}
            className="flex-1 bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sky-700 disabled:bg-sky-300"
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delay Modal ───────────────────────────────────────────────────────────────

interface DelayModalProps {
  task: MaintenanceTask
  onClose: () => void
  onDelayed: () => void
}

function DelayModal({ task, onClose, onDelayed }: DelayModalProps) {
  const [newDate, setNewDate] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  function confirm() {
    if (!newDate) return
    // Persist delay only for custom tasks (static mock tasks are read-only)
    const existing = customTaskStore.getAll().find(t => t.id === task.id)
    if (existing) {
      customTaskStore.update({ ...existing, dueDate: newDate, status: 'upcoming' })
    }
    onDelayed()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Delay Task</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-700 font-medium">{task.title}</p>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">New Due Date</label>
          <input
            type="date"
            value={newDate}
            min={today}
            onChange={e => setNewDate(e.target.value)}
            className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
          <button
            onClick={confirm}
            disabled={!newDate}
            className="flex-1 bg-slate-700 text-white rounded-xl py-2.5 text-sm font-medium disabled:bg-slate-300 hover:bg-slate-800"
          >
            Delay
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Day Detail Panel ──────────────────────────────────────────────────────────

interface DayDetailPanelProps {
  dateStr: string
  propertyId: string
  tasks: MaintenanceTask[]
  completedEvents: CompletedEvent[]
  today: string
  onClose: () => void
  onMutate: () => void
}

function DayDetailPanel({
  dateStr, propertyId, tasks, completedEvents, today, onClose, onMutate,
}: DayDetailPanelProps) {
  const [doneTask,   setDoneTask]   = useState<MaintenanceTask | null>(null)
  const [delayTask,  setDelayTask]  = useState<MaintenanceTask | null>(null)
  const [addingTask, setAddingTask] = useState(false)

  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const isToday = dateStr === today

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel — bottom sheet on mobile, right panel on desktop */}
      <div className="fixed bottom-0 inset-x-0 z-50 sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-96 modal-surface shadow-2xl flex flex-col max-h-[80vh] sm:max-h-none rounded-t-3xl sm:rounded-none overflow-hidden">

        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-slate-100 shrink-0">
          <div>
            {isToday && (
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-0.5">Today</p>
            )}
            <h2 className="text-base font-bold text-slate-900 leading-tight">{label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
              {completedEvents.length > 0 && ` · ${completedEvents.length} completed`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-1 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable task list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {tasks.length === 0 && completedEvents.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">No tasks scheduled for this day.</p>
              <p className="text-xs mt-1 text-slate-300">Use the button below to add one.</p>
            </div>
          )}

          {/* Pending/overdue tasks */}
          {tasks.map(task => {
            const pconf = priorityConfig(task.priority)
            const isOverdue = task.status === 'overdue' || (task.status !== 'completed' && task.dueDate < today)

            return (
              <div key={task.id} className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5">
                <div className="flex items-start gap-2 mb-3">
                  <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', pconf.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-xs text-slate-500 bg-slate-200 rounded-md px-1.5 py-0.5">
                        {task.systemLabel}
                      </span>
                      <span className={cn('text-xs font-medium border rounded-full px-2 py-0.5', pconf.badge)}>
                        {pconf.label}
                      </span>
                      {isOverdue && (
                        <span className="text-xs font-semibold text-red-600">Overdue</span>
                      )}
                    </div>
                    {task.estimatedCost !== undefined && task.estimatedCost > 0 && (
                      <p className="text-xs text-slate-500 mt-1.5">Est. ${task.estimatedCost.toLocaleString()}</p>
                    )}
                    {task.notes && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{task.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDoneTask(task)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Done
                  </button>
                  <button
                    onClick={() => setDelayTask(task)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Delay
                  </button>
                </div>
              </div>
            )
          })}

          {/* Completed events for this day */}
          {completedEvents.map(event => (
            <div key={event.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">{event.taskTitle}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {event.categoryId.replace(/_/g, ' ')}
                    {event.cost !== undefined && ` · $${event.cost.toLocaleString()}`}
                    {event.contractor && ` · ${event.contractor}`}
                  </p>
                  {event.notes && (
                    <p className="text-xs text-emerald-600/70 mt-1 leading-relaxed">{event.notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: Add task */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={() => setAddingTask(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add task for this day
          </button>
        </div>
      </div>

      {/* Layered modals */}
      {doneTask && (
        <DoneModal
          task={doneTask}
          onConfirm={() => { setDoneTask(null); onMutate() }}
          onClose={() => setDoneTask(null)}
        />
      )}
      {delayTask && (
        <DelayModal
          task={delayTask}
          onClose={() => setDelayTask(null)}
          onDelayed={onMutate}
        />
      )}
      {addingTask && (
        <AddTaskModal
          propertyId={propertyId}
          prefilledDate={dateStr}
          onClose={() => setAddingTask(false)}
          onSaved={onMutate}
        />
      )}
    </>
  )
}

// ── Main CalendarScreen ───────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type CalDay = { dateStr: string; day: number; thisMonth: boolean }

export function CalendarScreen() {
  const { activePropertyId } = useAppStore()
  const todayDate = new Date()
  const today     = todayDate.toISOString().slice(0, 10)

  const [year,        setYear]        = useState(todayDate.getFullYear())
  const [month,       setMonth]       = useState(todayDate.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [tick,        setTick]        = useState(0)

  // Data (re-read on every tick so mutations surface immediately)
  const customTasks = getAllCustomTasks()
  const allTasks    = [...MAINTENANCE_TASKS, ...customTasks]
    .filter(t => t.propertyId === activePropertyId)
  const completedAll = costStore.getAll()
    .filter(e => e.propertyId === activePropertyId)

  void tick // consumed by key to force re-render

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // ── Build grid ───────────────────────────────────────────────────────────────

  const firstDay     = firstDayOfMonth(year, month)
  const daysInMo     = daysInMonth(year, month)
  const prevDaysInMo = daysInMonth(year, month === 0 ? 11 : month - 1)
  const totalCells   = Math.ceil((firstDay + daysInMo) / 7) * 7

  const cells: CalDay[] = []
  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      const prevY = month === 0 ? year - 1 : year
      const prevM = month === 0 ? 11 : month - 1
      cells.push({ dateStr: isoDate(prevY, prevM, prevDaysInMo - (firstDay - i - 1)), day: prevDaysInMo - (firstDay - i - 1), thisMonth: false })
    } else {
      const d = i - firstDay + 1
      if (d <= daysInMo) {
        cells.push({ dateStr: isoDate(year, month, d), day: d, thisMonth: true })
      } else {
        const nextY = month === 11 ? year + 1 : year
        const nextM = month === 11 ? 0 : month + 1
        cells.push({ dateStr: isoDate(nextY, nextM, d - daysInMo), day: d - daysInMo, thisMonth: false })
      }
    }
  }

  // ── Day lookup helpers ───────────────────────────────────────────────────────

  function tasksForDay(dateStr: string): MaintenanceTask[] {
    return allTasks.filter(t => t.dueDate === dateStr)
  }

  function completedForDay(dateStr: string): CompletedEvent[] {
    return completedAll.filter(e => e.completionDate === dateStr)
  }

  // ── Month summary numbers ─────────────────────────────────────────────────────

  const monthPrefix  = `${year}-${String(month + 1).padStart(2, '0')}-`
  const monthTasks   = allTasks.filter(t => t.dueDate.startsWith(monthPrefix))
  const monthOverdue = monthTasks.filter(t => t.status === 'overdue' || t.dueDate < today)
  const monthDone    = completedAll.filter(e => e.completionDate.startsWith(monthPrefix))
  const monthEstCost = monthTasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)

  return (
    <div className="space-y-5" key={tick}>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Maintenance Calendar</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tap a day to view and manage scheduled tasks</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between card-surface rounded-2xl px-4 py-3 shadow-sm">
        <button
          onClick={prevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => { setYear(todayDate.getFullYear()); setMonth(todayDate.getMonth()) }}
          className="text-base font-bold text-slate-900 hover:text-sky-700 transition-colors"
        >
          {formatMonthYear(year, month)}
        </button>
        <button
          onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card-surface rounded-2xl shadow-sm overflow-hidden">

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              {d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const dayTasks     = tasksForDay(cell.dateStr)
            const dayCompleted = completedForDay(cell.dateStr)
            const totalCount   = dayTasks.length + dayCompleted.length
            const isToday      = cell.dateStr === today
            const isSelected   = cell.dateStr === selectedDay
            const borderR      = (idx + 1) % 7 !== 0
            const borderB      = idx < totalCells - 7

            // Build up to 3 colored dots: tasks first, then completed
            const dots: string[] = [
              ...dayTasks.map(t => taskDotBg(t, today)),
              ...dayCompleted.map(() => 'bg-emerald-500'),
            ].slice(0, 3)
            const moreCount = Math.max(0, totalCount - 3)

            return (
              <button
                key={cell.dateStr}
                onClick={() => {
                  if (!cell.thisMonth) return
                  setSelectedDay(prev => prev === cell.dateStr ? null : cell.dateStr)
                }}
                className={cn(
                  'relative flex flex-col items-center pt-2 pb-2 min-h-[4rem] sm:min-h-[5.5rem] transition-colors',
                  borderR && 'border-r border-slate-100',
                  borderB && 'border-b border-slate-100',
                  !cell.thisMonth && 'opacity-30 cursor-default',
                  cell.thisMonth && isSelected && 'bg-sky-50',
                  cell.thisMonth && !isSelected && 'hover:bg-slate-50 cursor-pointer',
                )}
              >
                {/* Day number */}
                <span className={cn(
                  'w-7 h-7 flex items-center justify-center text-sm rounded-full mb-1 leading-none font-medium',
                  isToday
                    ? 'bg-sky-600 text-white font-bold'
                    : isSelected
                    ? 'bg-sky-100 text-sky-700 font-semibold'
                    : 'text-slate-700',
                )}>
                  {cell.day}
                </span>

                {/* Task dots */}
                {dots.length > 0 && (
                  <div className="flex items-center gap-0.5 flex-wrap justify-center px-1">
                    {dots.map((color, di) => (
                      <span key={di} className={cn('w-1.5 h-1.5 rounded-full shrink-0', color)} />
                    ))}
                    {moreCount > 0 && (
                      <span className="text-[9px] text-slate-400 font-medium leading-none ml-0.5">
                        +{moreCount}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {[
          { color: 'bg-red-500',     label: 'Overdue'       },
          { color: 'bg-amber-400',   label: 'Due within 7d' },
          { color: 'bg-sky-500',     label: 'Scheduled'     },
          { color: 'bg-emerald-500', label: 'Completed'     },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', color)} />
            {label}
          </div>
        ))}
      </div>

      {/* Month summary card */}
      <div className="card-surface rounded-2xl px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {formatMonthYear(year, month)}
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-slate-800">{monthTasks.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Tasks due</p>
            {monthOverdue.length > 0 && (
              <p className="text-[11px] text-red-500 font-semibold mt-0.5">{monthOverdue.length} overdue</p>
            )}
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-600">{monthDone.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Completed</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-800">
              {monthEstCost > 0 ? `$${monthEstCost.toLocaleString()}` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Est. cost</p>
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <DayDetailPanel
          dateStr={selectedDay}
          propertyId={activePropertyId}
          tasks={tasksForDay(selectedDay)}
          completedEvents={completedForDay(selectedDay)}
          today={today}
          onClose={() => setSelectedDay(null)}
          onMutate={() => setTick(t => t + 1)}
        />
      )}

    </div>
  )
}
