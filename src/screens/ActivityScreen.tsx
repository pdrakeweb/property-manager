import { useState } from 'react'
import { ScrollText, Trash2 } from 'lucide-react'
import { auditLog } from '../lib/auditLog'
import type { LogEntry, LogLevel } from '../lib/auditLog'
import { cn } from '../utils/cn'

const LEVEL_STYLES: Record<LogLevel, string> = {
  info:  'text-slate-400 dark:text-slate-500',
  warn:  'text-amber-500',
  error: 'text-red-500',
}

const ACTION_LABELS: Record<string, string> = {
  'vendor.add':              'Added vendor',
  'vendor.update':           'Updated vendor',
  'vendor.remove':           'Removed vendor',
  'task.add':                'Added task',
  'task.update':             'Updated task',
  'task.remove':             'Removed task',
  'completed_event.add':     'Logged service event',
  'completed_event.update':  'Updated service event',
  'completed_event.remove':  'Removed service event',
  'capital_transaction.add':    'Added capital transaction',
  'capital_transaction.update': 'Updated capital transaction',
  'capital_transaction.remove': 'Removed capital transaction',
  'fuel_delivery.add':       'Logged fuel delivery',
  'fuel_delivery.update':    'Updated fuel delivery',
  'fuel_delivery.remove':    'Removed fuel delivery',
  'insurance.add':           'Added insurance policy',
  'insurance.update':        'Updated insurance policy',
  'insurance.remove':        'Removed insurance policy',
  'permit.add':              'Added permit',
  'permit.update':           'Updated permit',
  'permit.remove':           'Removed permit',
  'road.add':                'Logged road event',
  'road.update':             'Updated road event',
  'road.remove':             'Removed road event',
  'generator_log.add':       'Logged generator run',
  'generator_log.update':    'Updated generator log',
  'generator_log.remove':    'Removed generator log',
  'mortgage.add':            'Added mortgage',
  'mortgage.update':         'Updated mortgage',
  'mortgage.remove':         'Removed mortgage',
  'mortgage_payment.add':    'Logged mortgage payment',
  'mortgage_payment.update': 'Updated mortgage payment',
  'mortgage_payment.remove': 'Removed mortgage payment',
  'utility_account.add':     'Added utility account',
  'utility_account.update':  'Updated utility account',
  'utility_account.remove':  'Removed utility account',
  'utility_bill.add':        'Logged utility bill',
  'utility_bill.update':     'Updated utility bill',
  'utility_bill.remove':     'Removed utility bill',
  'tax_assessment.add':      'Added tax assessment',
  'tax_payment.add':         'Logged tax payment',
  'septic_event.add':        'Logged septic event',
  'well_test.add':           'Logged well test',
}

function isSyncAction(action: string): boolean {
  return action.startsWith('sync')
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function groupByDay(entries: LogEntry[]): { date: string; entries: LogEntry[] }[] {
  const map = new Map<string, LogEntry[]>()
  for (const e of entries) {
    const day = new Date(e.ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(e)
  }
  return [...map.entries()].map(([date, entries]) => ({ date, entries }))
}

export function ActivityScreen() {
  const [filter, setFilter]   = useState<'all' | 'user' | 'sync'>('user')
  const [entries, setEntries] = useState<LogEntry[]>(() => auditLog.getRecent(500))
  const filtered = entries.filter(e =>
    filter === 'all'  ? true :
    filter === 'user' ? !isSyncAction(e.action) :
    isSyncAction(e.action)
  )

  const groups = groupByDay(filtered)

  function clearAll() {
    auditLog.clear()
    setEntries([])
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-slate-400" />
            Activity Log
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors mt-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear all
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(['user', 'sync', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
              filter === f
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
            )}
          >
            {f === 'user' ? 'User actions' : f === 'sync' ? 'Sync events' : 'All'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-10 text-center shadow-sm">
          <p className="text-sm text-slate-500 dark:text-slate-400">No activity yet.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Events are recorded as you add and update records.</p>
        </div>
      ) : (
        groups.map(({ date, entries: dayEntries }) => (
          <div key={date}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 px-1">
              {date}
            </h2>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
              {dayEntries.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn('text-xs font-semibold uppercase w-8 shrink-0 mt-0.5', LEVEL_STYLES[entry.level])}>
                    {entry.level === 'info' ? '·' : entry.level === 'warn' ? '!' : '✕'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
                      {formatAction(entry.action)}
                      {entry.message && entry.message !== formatAction(entry.action) && (
                        <span className="text-slate-500 dark:text-slate-400 font-normal"> — {entry.message}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {new Date(entry.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {entry.propertyId && <> · {entry.propertyId}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Errors/warnings callout */}
      {filter !== 'sync' && entries.filter(e => e.level === 'error').length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            {entries.filter(e => e.level === 'error').length} error{entries.filter(e => e.level === 'error').length !== 1 ? 's' : ''} in log — switch to "All" or "Sync events" to see details.
          </p>
        </div>
      )}

    </div>
  )
}
