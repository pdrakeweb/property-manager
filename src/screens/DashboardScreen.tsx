import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera, Wrench, BarChart3, MessageSquare, AlertTriangle,
  CheckCircle2, Circle, ChevronRight, Zap, ShieldAlert, Receipt, Home,
  Plus, X, ChevronDown, ChevronUp, Building2, TreePine,
} from 'lucide-react'
import { cn } from '../utils/cn'
import {
  CAPITAL_ITEMS, HA_STATUS, CATEGORIES, PROPERTIES,
} from '../data/mockData'
import { getYTDSpend, costStore } from '../lib/costStore'
import { getUpcomingExpiries } from '../lib/expiryStore'
import { ExpiryWidget } from '../components/ExpiryWidget'
import { MiniCalendar } from '../components/MiniCalendar'
import { getNextTaxPayment, getOverdueTaxPayments, getAssessmentsForProperty } from '../lib/taxStore'
import { getTotalMortgageBalance } from '../lib/mortgageStore'
import { customTaskStore, getActiveTasks } from '../lib/maintenanceStore'
import { localIndex } from '../lib/localIndex'
import { useAppStore } from '../store/AppStoreContext'
import { PropertyHealthCard } from '../components/dashboard/PropertyHealthCard'
import type { Priority, HAStatus, MaintenanceTask } from '../types'

// ── Dashboard mode ────────────────────────────────────────────────────────────

type DashboardMode = 'all' | 'single'

const DASHBOARD_MODE_KEY = 'pm_dashboard_mode'

function readDashboardMode(): DashboardMode {
  const stored = localStorage.getItem(DASHBOARD_MODE_KEY)
  return stored === 'single' ? 'single' : 'all'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityColor(p: Priority) {
  return {
    critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    high:     'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',
    medium:   'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    low:      'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
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
    off:     'text-slate-400 dark:text-slate-500',
    unknown: 'text-slate-400 dark:text-slate-500',
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-0.5">
          {action} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm', className)}>
      {children}
    </div>
  )
}

// ── Quick-Add Maintenance Modal ───────────────────────────────────────────────

function QuickAddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [propertyId, setPropertyId] = useState(PROPERTIES[0].id)
  const [title,      setTitle]      = useState('')
  const [system,     setSystem]     = useState('')
  const [dueDate,    setDueDate]    = useState(new Date().toISOString().slice(0, 10))
  const [priority,   setPriority]   = useState<Priority>('medium')

  function handleSave() {
    if (!title.trim()) return
    const task: MaintenanceTask = {
      id:          `custom_${Date.now()}`,
      propertyId,
      title:       title.trim(),
      systemLabel: system.trim() || 'General',
      categoryId:  'service_record',
      dueDate,
      priority,
      status:      'upcoming',
      source:      'manual',
    }
    customTaskStore.add(task)
    onSaved()
    onClose()
  }

  const inp = 'w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Quick Add Task</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Property</label>
          <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={cn(inp, 'bg-white dark:bg-slate-800')}>
            {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Task Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clean gutters" className={inp} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">System / Area</label>
          <input type="text" value={system} onChange={e => setSystem(e.target.value)} placeholder="e.g. Roof, Plumbing" className={inp} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={cn(inp, 'bg-white dark:bg-slate-800')}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex-[2] py-3 rounded-2xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-sky-300"
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Property health badge ─────────────────────────────────────────────────────

function healthBadge(overdueCount: number) {
  if (overdueCount === 0) return { label: 'Good',    cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' }
  if (overdueCount <= 3)  return { label: `${overdueCount} overdue`, cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' }
  return                         { label: `${overdueCount} overdue`, cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' }
}

const PROP_ICONS = { residence: Building2, camp: TreePine, land: Building2 }

// ── Main Screen ───────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const { activePropertyId, setActivePropertyId } = useAppStore()

  const [showQuickAdd,  setShowQuickAdd]  = useState(false)
  const [detailOpen,    setDetailOpen]    = useState(true)
  const [tick,          setTick]          = useState(0)
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(readDashboardMode)

  function toggleDashboardMode(mode: DashboardMode) {
    localStorage.setItem(DASHBOARD_MODE_KEY, mode)
    setDashboardMode(mode)
  }

  function handlePropertySelect(propertyId: string) {
    setActivePropertyId(propertyId)
    toggleDashboardMode('single')
  }

  const today       = new Date().toISOString().slice(0, 10)
  const in30Days    = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  // All tasks across all properties from local index (seeds on first call per property)
  const allTasks = PROPERTIES.flatMap(p => getActiveTasks(p.id))

  // ── Cross-property aggregates ──────────────────────────────────────────────

  const allOverdue = allTasks.filter(t => t.status === 'overdue' || (t.status !== 'completed' && t.dueDate < today))
  const allDue30   = allTasks.filter(t => t.status !== 'completed' && t.dueDate >= today && t.dueDate <= in30Days)

  // Property health data
  const propHealth = PROPERTIES.map(p => {
    const overdueCount = allOverdue.filter(t => t.propertyId === p.id).length
    // Count documented categories from local index (accurate offline)
    const cats         = CATEGORIES.filter(c => c.propertyTypes.includes(p.type))
    const docCount     = cats.filter(c => localIndex.getCount('equipment', p.id) > 0
      ? localIndex.getAll('equipment', p.id).some(r => r.categoryId === c.id)
      : (c.recordCount ?? 0) > 0
    ).length
    const docPct       = cats.length > 0 ? Math.round(docCount / cats.length * 100) : 0
    const lastActivity = costStore.getAll()
      .filter(e => e.propertyId === p.id)
      .sort((a, b) => b.completionDate.localeCompare(a.completionDate))[0]?.completionDate ?? null
    return { ...p, overdueCount, docPct, lastActivity }
  })

  // Group overdue by property
  const overdueByProp = PROPERTIES.map(p => ({
    property: p,
    tasks:    allOverdue.filter(t => t.propertyId === p.id)
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, medium: 2, low: 3 }
        return rank[a.priority] - rank[b.priority]
      }),
  })).filter(g => g.tasks.length > 0)

  // ── Per-property detail data ───────────────────────────────────────────────

  const activeProperty = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]
  const tasks     = allTasks.filter(t => t.propertyId === activePropertyId)
  const items     = CAPITAL_ITEMS.filter(i => i.propertyId === activePropertyId)
  const cats      = CATEGORIES.filter(c => c.propertyTypes.includes(activeProperty.type))
  const dueTasks     = tasks.filter(t => t.status === 'due' || t.status === 'overdue')
  const topCapital   = items.filter(c => c.priority === 'critical' || c.priority === 'high')
  const hasIndexed   = localIndex.getCount('equipment', activePropertyId) > 0
  const documented   = cats.filter(c => hasIndexed
    ? localIndex.getAll('equipment', activePropertyId).some(r => r.categoryId === c.id)
    : (c.recordCount ?? 0) > 0
  ).length
  const total        = cats.length

  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening'

  const ytdSpend = getYTDSpend(activePropertyId)
  const expiries = getUpcomingExpiries(activePropertyId, 90)

  // Tax & mortgage
  const nextTaxPmt      = getNextTaxPayment(activePropertyId)
  const overdueTaxPmts  = getOverdueTaxPayments(activePropertyId)
  const totalMtgBalance = getTotalMortgageBalance(activePropertyId)
  const latestAssess    = getAssessmentsForProperty(activePropertyId)[0]
  const equity          = latestAssess && totalMtgBalance > 0
    ? (latestAssess.marketValue ?? latestAssess.totalAssessed) - totalMtgBalance
    : null

  return (
    <div className="space-y-6" key={tick}>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{greeting}, Pete</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowQuickAdd(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>

      {/* ── Dashboard Mode Toggle ───────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl w-fit">
        {(['all', 'single'] as DashboardMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => toggleDashboardMode(mode)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
              dashboardMode === mode
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {mode === 'all' ? 'All Properties' : 'This Property'}
          </button>
        ))}
      </div>

      {/* ── Cross-Property Health Cards (All mode only) ──────────────────── */}
      {dashboardMode === 'all' && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Property Health</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROPERTIES.map(p => (
              <PropertyHealthCard key={p.id} property={p} onSelect={handlePropertySelect} />
            ))}
          </div>
        </div>
      )}

      {/* ── Property Health Row (All mode only) ──────────────────────────── */}
      {dashboardMode === 'all' && (
      <div>
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Property Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {propHealth.map(p => {
            const badge = healthBadge(p.overdueCount)
            const Icon  = PROP_ICONS[p.type]
            return (
              <div key={p.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{p.shortName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{p.address || p.type}</p>
                    </div>
                  </div>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0', badge.cls)}>
                    {badge.label}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Documentation</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{p.docPct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${p.docPct}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {p.lastActivity
                      ? `Last activity: ${new Date(p.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'No activity recorded'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Overdue Across All Properties (All mode only) ──────────────── */}
      {dashboardMode === 'all' && overdueByProp.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700">
              {allOverdue.length} Overdue {allOverdue.length === 1 ? 'Task' : 'Tasks'}
            </h2>
          </div>
          <div className="space-y-3">
            {overdueByProp.map(({ property: prop, tasks: propTasks }) => (
              <div key={prop.id} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 border-b border-red-100 dark:border-red-900">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">{prop.shortName}</span>
                </div>
                <div className="divide-y divide-red-100 dark:divide-red-900">
                  {propTasks.slice(0, 3).map(task => (
                    <div
                      key={task.id}
                      onClick={() => navigate('/maintenance')}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <div className={cn('w-2 h-2 rounded-full shrink-0', priorityDot(task.priority))} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800 dark:text-red-300 leading-tight truncate">{task.title}</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          {task.systemLabel} · Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
                    </div>
                  ))}
                  {propTasks.length > 3 && (
                    <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 font-medium">
                      +{propTasks.length - 3} more overdue tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Due in 30 Days (All mode only) ─────────────────────────────── */}
      {dashboardMode === 'all' && allDue30.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Due in 30 Days — All Properties
          </h2>
          <Card>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {allDue30.slice(0, 6).map(task => {
                const prop = PROPERTIES.find(p => p.id === task.propertyId)
                return (
                  <div
                    key={task.id}
                    onClick={() => navigate('/maintenance')}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className={cn('w-2 h-2 rounded-full shrink-0', priorityDot(task.priority))} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight truncate">{task.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {prop?.shortName} · {task.systemLabel} · Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className={cn('shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border', priorityColor(task.priority))}>
                      {task.priority}
                    </span>
                  </div>
                )
              })}
              {allDue30.length > 6 && (
                <div className="px-4 py-2.5 text-xs text-slate-400 dark:text-slate-500">
                  +{allDue30.length - 6} more tasks due this month
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Capital Projects — All Properties (All mode only) ─────────── */}
      {dashboardMode === 'all' && CAPITAL_ITEMS.filter(i => i.priority === 'critical' || i.priority === 'high').length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Capital Projects — All Properties
          </h2>
          <Card>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {CAPITAL_ITEMS.filter(i => i.priority === 'critical' || i.priority === 'high').slice(0, 5).map(item => {
                const prop = PROPERTIES.find(p => p.id === item.propertyId)
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={cn('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border', priorityColor(item.priority))}>
                      {item.priority === 'critical' ? 'Critical' : 'High'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {prop?.shortName} · Est. {item.estimatedYear} · ${item.costLow.toLocaleString()}–${item.costHigh.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Mini Calendar ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Calendar</h2>
        <MiniCalendar propertyId={activePropertyId} />
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {[
          { icon: Camera,        label: 'Capture',     sub: 'Record equipment',         to: '/capture',     color: 'bg-green-600'     },
          { icon: Wrench,        label: 'Maintenance', sub: `${dueTasks.length} due`,   to: '/maintenance', color: 'bg-orange-500'  },
          { icon: BarChart3,     label: 'Budget',      sub: 'Capital forecast',         to: '/budget',      color: 'bg-violet-600'  },
          { icon: MessageSquare, label: 'Ask AI',      sub: 'Property advisor',         to: '/advisor',     color: 'bg-emerald-600' },
          { icon: ShieldAlert,   label: 'Emergency',   sub: 'Shutoffs & contacts',      to: '/emergency',   color: 'bg-red-600'     },
        ].map(({ icon: Icon, label, sub, to, color }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-left hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', color)}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:hover:text-slate-100">{label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>
          </button>
        ))}
      </div>

      {/* ── Alert Banners ───────────────────────────────────────────────── */}
      {overdueTaxPmts.length > 0 && (
        <div
          onClick={() => navigate('/tax')}
          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-100 transition-colors"
        >
          <Receipt className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 font-medium flex-1">
            {overdueTaxPmts.length} overdue tax payment{overdueTaxPmts.length > 1 ? 's' : ''}
            {' — '}${overdueTaxPmts[0].amount.toLocaleString()} due {new Date(overdueTaxPmts[0].dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <ChevronRight className="w-4 h-4 text-red-400" />
        </div>
      )}

      {/* ── YTD Spend Card ──────────────────────────────────────────────── */}
      {ytdSpend > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">YTD Maintenance Spend</p>
            <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">${ytdSpend.toLocaleString()}</p>
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 text-right">
            <p>{new Date().getFullYear()}</p>
          </div>
        </div>
      )}

      {/* ── Property Detail (collapsible) ────────────────────────────────── */}
      <div>
        <button
          onClick={() => setDetailOpen(o => !o)}
          className="flex items-center gap-2 w-full text-left mb-3"
        >
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            {activeProperty.shortName} — Detail
          </h2>
          {detailOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-auto" />
            : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-auto" />
          }
        </button>

        {detailOpen && (
          <div className="space-y-5">

            {/* Two-column grid on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Maintenance Due */}
              <Card>
                <div className="px-5 pt-5 pb-4">
                  <SectionHeader title="Maintenance Due" action="View all" onAction={() => navigate('/maintenance')} />
                  {tasks.filter(t => t.status !== 'completed').length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No pending tasks.</p>
                  ) : (
                    <div className="space-y-3">
                      {tasks.filter(t => t.status !== 'completed').slice(0, 4).map(task => (
                        <div key={task.id} className="flex items-start gap-3">
                          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', priorityDot(task.priority))} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight">{task.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {task.systemLabel} · Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {task.estimatedCost ? ` · $${task.estimatedCost}` : ''}
                            </p>
                          </div>
                          <span className={cn(
                            'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border',
                            task.dueDate < today ? 'text-red-600 bg-red-50 border-red-200' :
                            task.status === 'due' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                            'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
                          )}>
                            {task.dueDate < today ? 'Overdue' : task.status === 'due' ? 'Due soon' : 'Upcoming'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Capital Watch */}
              <Card>
                <div className="px-5 pt-5 pb-4">
                  <SectionHeader title="Capital Watch" action="Full forecast" onAction={() => navigate('/budget')} />
                  {topCapital.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No critical or high items.</p>
                  ) : (
                    <div className="space-y-3">
                      {topCapital.slice(0, 4).map(item => (
                        <div key={item.id} className="flex items-start gap-3">
                          <div className={cn('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border mt-0.5', priorityColor(item.priority))}>
                            {item.priority === 'critical' ? 'Critical' : 'High'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight">{item.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {item.installYear ? `${item.installYear} (${item.ageYears}yr)` : `Est. ${item.estimatedYear}`}
                              {' · '}${item.costLow.toLocaleString()}–${item.costHigh.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Live HA Status */}
              <Card>
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Live Status</h2>
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
                          <span className="text-sm text-slate-700 dark:text-slate-300">{sensor.label}</span>
                        </div>
                        <span className={cn('text-sm font-semibold tabular-nums', haStatusColor(sensor.status))}>
                          {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  {HA_STATUS.some(s => s.status === 'warning') && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
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
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{documented} of {total} categories documented</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{Math.round(documented / total * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${documented / total * 100}%` }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {cats.slice(0, 6).map(cat => (
                      <div key={cat.id} className="flex items-center gap-2.5">
                        {cat.recordCount && cat.recordCount > 0
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          : <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                        }
                        <span className={cn('text-sm', cat.recordCount && cat.recordCount > 0 ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500 font-medium')}>
                          {cat.icon} {cat.label}
                        </span>
                        {cat.recordCount && cat.recordCount > 0 ? (
                          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{cat.recordCount} record{cat.recordCount > 1 ? 's' : ''}</span>
                        ) : (
                          <button onClick={() => navigate('/capture')} className="ml-auto text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium">
                            + Add
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Expiry Widget */}
              {expiries.length > 0 && (
                <ExpiryWidget propertyId={activePropertyId} />
              )}

              {/* Next Tax Payment */}
              {nextTaxPmt && (
                <Card>
                  <div className="px-5 pt-5 pb-4">
                    <SectionHeader title="Property Tax" action="View all" onAction={() => navigate('/tax')} />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center shrink-0">
                        <Receipt className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {nextTaxPmt.year} · Installment {nextTaxPmt.installment}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Due {new Date(nextTaxPmt.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <p className="text-base font-bold text-amber-700 shrink-0">
                        ${nextTaxPmt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Equity Card */}
              {equity !== null && (
                <Card>
                  <div className="px-5 pt-5 pb-4">
                    <SectionHeader title="Home Equity" action="Mortgages" onAction={() => navigate('/mortgage')} />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center shrink-0">
                        <Home className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">${equity.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Market ${(latestAssess!.marketValue ?? latestAssess!.totalAssessed).toLocaleString()} − Debt ${totalMtgBalance.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

            </div>

            {/* Recent Activity */}
            <Card>
              <div className="px-5 pt-5 pb-4">
                <SectionHeader title="Recent Activity" />
                <div className="space-y-3">
                  {[
                    { date: 'Apr 11', text: 'Water heater — AI advisor session saved to Drive', icon: MessageSquare, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' },
                    { date: 'Jan 15', text: 'HVAC filter replaced — service record saved',       icon: Wrench,        color: 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20' },
                    { date: 'Nov 1',  text: 'Generator annual service — Buckeye Power Sales',    icon: Zap,           color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'       },
                  ].map(({ date, text, icon: Icon, color }) => (
                    <div key={text} className="flex items-start gap-3">
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-tight">{text}</p>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

          </div>
        )}
      </div>

      {/* ── Quick-add modal ──────────────────────────────────────────────── */}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onSaved={() => setTick(t => t + 1)}
        />
      )}

    </div>
  )
}
