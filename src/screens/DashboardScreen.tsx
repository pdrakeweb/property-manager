import { useNavigate } from 'react-router-dom'
import {
  Camera, Wrench, BarChart3, MessageSquare, AlertTriangle,
  CheckCircle2, Circle, ChevronRight, Wifi, WifiOff, Zap,
  TrendingUp, ClipboardList,
} from 'lucide-react'
import { cn } from '../utils/cn'
import {
  MAINTENANCE_TASKS, CAPITAL_ITEMS, HA_STATUS, CATEGORIES,
} from '../data/mockData'
import type { Priority, HAStatus } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────

function priorityColor(p: Priority) {
  return {
    critical: 'text-red-600 bg-red-50 border-red-200',
    high:     'text-orange-600 bg-orange-50 border-orange-200',
    medium:   'text-amber-600 bg-amber-50 border-amber-200',
    low:      'text-slate-500 bg-slate-50 border-slate-200',
  }[p]
}

function priorityDot(p: Priority) {
  return {
    critical: 'bg-red-500',
    high:     'bg-orange-500',
    medium:   'bg-amber-400',
    low:      'bg-slate-300',
  }[p]
}

function haStatusColor(s: HAStatus['status']) {
  return {
    ok:      'text-emerald-600',
    warning: 'text-amber-500',
    alert:   'text-red-500',
    off:     'text-slate-400',
    unknown: 'text-slate-400',
  }[s]
}

function haStatusDot(s: HAStatus['status']) {
  return {
    ok:      'bg-emerald-400',
    warning: 'bg-amber-400 animate-pulse',
    alert:   'bg-red-500 animate-pulse',
    off:     'bg-slate-300',
    unknown: 'bg-slate-300',
  }[s]
}

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-0.5">
          {action} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
      {children}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()

  const overdueTasks = MAINTENANCE_TASKS.filter(t => t.status === 'overdue')
  const dueTasks     = MAINTENANCE_TASKS.filter(t => t.status === 'due' || t.status === 'overdue')
  const topCapital   = CAPITAL_ITEMS.filter(c => c.priority === 'critical' || c.priority === 'high')

  const documented = CATEGORIES.reduce((n, c) => n + (c.recordCount && c.recordCount > 0 ? 1 : 0), 0)
  const total      = CATEGORIES.length

  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">{greeting}, Pete</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* ── Alert Banner ────────────────────────────────────────────── */}
      {overdueTasks.length > 0 && (
        <div
          onClick={() => navigate('/maintenance')}
          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 font-medium flex-1">
            {overdueTasks.length} overdue maintenance {overdueTasks.length === 1 ? 'task' : 'tasks'}
            {' — '}{overdueTasks[0].title}
          </span>
          <ChevronRight className="w-4 h-4 text-red-400" />
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Camera,       label: 'Capture',     sub: 'Record equipment',    to: '/capture',     color: 'bg-sky-600'     },
          { icon: Wrench,       label: 'Maintenance', sub: `${dueTasks.length} due`,    to: '/maintenance', color: 'bg-orange-500'  },
          { icon: BarChart3,    label: 'Budget',      sub: 'Capital forecast',    to: '/budget',      color: 'bg-violet-600'  },
          { icon: MessageSquare,label: 'Ask AI',      sub: 'Property advisor',    to: '/advisor',     color: 'bg-emerald-600' },
        ].map(({ icon: Icon, label, sub, to, color }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', color)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
          </button>
        ))}
      </div>

      {/* ── Two-column grid on desktop ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Maintenance Due */}
        <Card>
          <div className="px-5 pt-5 pb-4">
            <SectionHeader title="Maintenance Due" action="View all" onAction={() => navigate('/maintenance')} />
            <div className="space-y-3">
              {MAINTENANCE_TASKS.filter(t => t.status !== 'completed').slice(0, 4).map(task => (
                <div key={task.id} className="flex items-start gap-3">
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', priorityDot(task.priority))} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-tight">{task.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {task.systemLabel} · Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {task.estimatedCost ? ` · $${task.estimatedCost}` : ''}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border',
                    task.status === 'overdue' ? 'text-red-600 bg-red-50 border-red-200' :
                    task.status === 'due'     ? 'text-orange-600 bg-orange-50 border-orange-200' :
                    'text-slate-500 bg-slate-50 border-slate-200',
                  )}>
                    {task.status === 'overdue' ? 'Overdue' : task.status === 'due' ? 'Due soon' : 'Upcoming'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Capital Watch */}
        <Card>
          <div className="px-5 pt-5 pb-4">
            <SectionHeader title="Capital Watch" action="Full forecast" onAction={() => navigate('/budget')} />
            <div className="space-y-3">
              {topCapital.slice(0, 4).map(item => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className={cn('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border mt-0.5', priorityColor(item.priority))}>
                    {item.priority === 'critical' ? 'Critical' : 'High'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-tight">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.installYear ? `${item.installYear} (${item.ageYears}yr)` : `Est. ${item.estimatedYear}`}
                      {' · '}${item.costLow.toLocaleString()}–${item.costHigh.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Live HA Status */}
        <Card>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Live Status</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-600 font-medium">Home Assistant</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {HA_STATUS.map(sensor => (
                <div key={sensor.entityId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full shrink-0', haStatusDot(sensor.status))} />
                    <span className="text-sm text-slate-700">{sensor.label}</span>
                  </div>
                  <span className={cn('text-sm font-semibold tabular-nums', haStatusColor(sensor.status))}>
                    {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ''}
                  </span>
                </div>
              ))}
            </div>
            {HA_STATUS.some(s => s.status === 'warning') && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-amber-600">Generator oil due within 44 hrs of runtime</span>
              </div>
            )}
          </div>
        </Card>

        {/* Documentation Checklist */}
        <Card>
          <div className="px-5 pt-5 pb-4">
            <SectionHeader title="Documentation" action="Full checklist" onAction={() => navigate('/inventory')} />

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">{documented} of {total} categories documented</span>
                <span className="text-xs font-semibold text-slate-700">{Math.round(documented / total * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${documented / total * 100}%` }}
                />
              </div>
            </div>

            {/* Category status rows */}
            <div className="space-y-2">
              {CATEGORIES.slice(0, 6).map(cat => (
                <div key={cat.id} className="flex items-center gap-2.5">
                  {cat.recordCount && cat.recordCount > 0
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <Circle      className="w-4 h-4 text-slate-300 shrink-0" />
                  }
                  <span className={cn(
                    'text-sm',
                    cat.recordCount && cat.recordCount > 0 ? 'text-slate-600' : 'text-slate-400 font-medium',
                  )}>
                    {cat.icon} {cat.label}
                  </span>
                  {cat.recordCount && cat.recordCount > 0 ? (
                    <span className="ml-auto text-xs text-slate-400">{cat.recordCount} record{cat.recordCount > 1 ? 's' : ''}</span>
                  ) : (
                    <button
                      onClick={() => navigate('/capture')}
                      className="ml-auto text-xs text-sky-600 hover:text-sky-700 font-medium"
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

      </div>

      {/* ── Recent Activity ──────────────────────────────────────────── */}
      <Card>
        <div className="px-5 pt-5 pb-4">
          <SectionHeader title="Recent Activity" />
          <div className="space-y-3">
            {[
              { date: 'Apr 11', text: 'Water heater — AI advisor session saved to Drive', icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50' },
              { date: 'Jan 15', text: 'HVAC filter replaced — service record saved',       icon: Wrench,        color: 'text-orange-500 bg-orange-50' },
              { date: 'Nov 1',  text: 'Generator annual service — Buckeye Power Sales',    icon: Zap,           color: 'text-sky-600 bg-sky-50'       },
            ].map(({ date, text, icon: Icon, color }) => (
              <div key={text} className="flex items-start gap-3">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', color)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-tight">{text}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{date}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

    </div>
  )
}
