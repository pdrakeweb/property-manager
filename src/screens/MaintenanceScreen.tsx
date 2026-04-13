import { useState } from 'react'
import {
  CheckCircle2, Clock, AlertTriangle, Zap, ChevronDown,
  ChevronUp, Calendar, DollarSign, User, RepeatIcon,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { MAINTENANCE_TASKS, SERVICE_RECORDS } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'
import type { MaintenanceTask, Priority } from '../types'

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
    'ha-trigger':   { label: 'HA Usage', icon: Zap,         color: 'text-sky-600 bg-sky-50 border-sky-100'       },
    'manufacturer': { label: 'Mfr.',     icon: Clock,        color: 'text-slate-600 bg-slate-50 border-slate-100' },
    'ai-suggested': { label: 'AI',       icon: Zap,          color: 'text-violet-600 bg-violet-50 border-violet-100' },
    'manual':       { label: 'Manual',   icon: User,         color: 'text-slate-500 bg-slate-50 border-slate-100' },
  }[s]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function TaskCard({ task }: { task: MaintenanceTask }) {
  const [expanded,       setExpanded]       = useState(false)
  const [done,           setDone]           = useState(false)
  const [delayOpen,      setDelayOpen]      = useState(false)
  const [scheduleOpen,   setScheduleOpen]   = useState(false)
  const [doneModalOpen,  setDoneModalOpen]  = useState(false)
  const [currentDueDate, setCurrentDueDate] = useState(task.dueDate)
  const [currentRecur,   setCurrentRecur]   = useState(task.recurrence ?? '')
  const [customDelay,    setCustomDelay]    = useState('')
  // Done modal fields
  const [completionDate, setCompletionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [actualCost,     setActualCost]     = useState('')
  const [doneContractor, setDoneContractor] = useState(task.contractor ?? '')
  const [doneNotes,      setDoneNotes]      = useState('')

  const pconf   = priorityConfig(task.priority)
  const src     = sourceLabel(task.source)
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
      {/* Done completion modal */}
      {doneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Complete Task</h3>
              <p className="text-sm text-slate-500 mt-0.5">{task.title}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Completion Date</label>
                <input
                  type="date"
                  value={completionDate}
                  onChange={e => setCompletionDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Actual Cost (optional)</label>
                <input
                  type="number"
                  value={actualCost}
                  onChange={e => setActualCost(e.target.value)}
                  placeholder="0"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contractor</label>
                <input
                  type="text"
                  value={doneContractor}
                  onChange={e => setDoneContractor(e.target.value)}
                  placeholder="Who did the work?"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={doneNotes}
                  onChange={e => setDoneNotes(e.target.value)}
                  placeholder="Any notes about the work done?"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDoneModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => { setDoneModalOpen(false); setDone(true) }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Mark Complete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Clickable header — entire row expands/collapses */}
        <div
          onClick={() => setExpanded(e => !e)}
          className="px-4 py-4 cursor-pointer select-none"
        >
          <div className="flex items-start gap-3">
            <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', pconf.dot)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{task.title}</p>
                <div className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-400">
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
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
                  Due {new Date(currentDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {task.estimatedCost !== undefined && task.estimatedCost > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Est. ${task.estimatedCost.toLocaleString()}
                  </span>
                )}
                {currentRecur && (
                  <span className="flex items-center gap-1">
                    <RepeatIcon className="w-3 h-3" />
                    {currentRecur}
                  </span>
                )}
              </div>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 ml-5">
              {task.contractor && (
                <p className="text-xs text-slate-600">
                  <span className="font-medium">Contractor:</span> {task.contractor}
                </p>
              )}
              {task.notes && (
                <p className="text-xs text-slate-600">
                  <span className="font-medium">Notes:</span> {task.notes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Delay panel */}
        {delayOpen && (
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
            <p className="text-xs font-medium text-slate-600">Delay until:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setCurrentDueDate(addDays(currentDueDate, 7)); setDelayOpen(false) }}
                className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                +1 Week
              </button>
              <button
                onClick={() => { setCurrentDueDate(addMonths(currentDueDate, 1)); setDelayOpen(false) }}
                className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                +1 Month
              </button>
              <input
                type="date"
                value={customDelay}
                onChange={e => setCustomDelay(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
              {customDelay && (
                <button
                  onClick={() => { setCurrentDueDate(customDelay); setDelayOpen(false); setCustomDelay('') }}
                  className="text-xs bg-sky-600 text-white rounded-lg px-3 py-1.5 hover:bg-sky-700"
                >
                  Set
                </button>
              )}
            </div>
            <button onClick={() => setDelayOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        )}

        {/* Schedule/recurrence panel */}
        {scheduleOpen && (
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
            <p className="text-xs font-medium text-slate-600">Recurrence:</p>
            <div className="flex flex-wrap gap-2">
              {['Monthly', 'Every 3 months', 'Every 6 months', 'Annually', 'Every 2 years'].map(r => (
                <button
                  key={r}
                  onClick={() => { setCurrentRecur(r); setScheduleOpen(false) }}
                  className={cn(
                    'text-xs border rounded-lg px-3 py-1.5 transition-colors',
                    currentRecur === r
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <button onClick={() => setScheduleOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        )}

        {/* Action row */}
        <div className="border-t border-slate-100 flex">
          <button
            onClick={() => { setDelayOpen(false); setScheduleOpen(false); setDoneModalOpen(true) }}
            className="flex-1 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark Done
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={() => { setScheduleOpen(false); setDelayOpen(o => !o) }}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              delayOpen ? 'text-sky-600 bg-sky-50' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            Delay
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={() => { setDelayOpen(false); setScheduleOpen(o => !o) }}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              scheduleOpen ? 'text-sky-600 bg-sky-50' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            Schedule
          </button>
        </div>
      </div>
    </>
  )
}

export function MaintenanceScreen() {
  const [tab, setTab] = useState<Tab>('due')
  const { activePropertyId } = useAppStore()
  const propertyTasks = MAINTENANCE_TASKS.filter(t => t.propertyId === activePropertyId)
  const overdue  = propertyTasks.filter(t => t.status === 'overdue')
  const due      = propertyTasks.filter(t => t.status === 'due')
  const upcoming = propertyTasks.filter(t => t.status === 'upcoming')

  const dueTasks      = [...overdue, ...due]
  const upcomingTasks = upcoming
  const totalCostDue  = dueTasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0)

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'due',      label: 'Due Now',  count: dueTasks.length      },
    { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length  },
    { id: 'history',  label: 'History',  count: SERVICE_RECORDS.length},
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
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
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
          {overdue.map(task => <TaskCard key={task.id} task={task} />)}

          {due.length > 0 && (
            <p className="text-xs font-semibold uppercase text-orange-500 tracking-wide mt-4">Due Soon</p>
          )}
          {due.map(task => <TaskCard key={task.id} task={task} />)}

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
          {upcomingTasks.map(task => <TaskCard key={task.id} task={task} />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
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
        </div>
      )}

      {/* Add task button */}
      <button className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors">
        + Add maintenance task
      </button>

    </div>
  )
}
