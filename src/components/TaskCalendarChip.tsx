import { useState } from 'react'
import { CalendarPlus, CalendarCheck, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '../utils/cn'
import { isDev, getValidToken } from '../auth/oauth'
import { addTaskToCalendar, syncAllToCalendar } from '../lib/calendarClient'
import type { DryRunResult } from '../lib/calendarClient'
import { getPropertyById } from '../lib/propertyStore'
import type { IndexRecord } from '../lib/localIndex'
import { DryRunModal } from './DryRunModal'

interface TaskCalendarChipProps {
  task:       IndexRecord
  propertyId: string
}

export function TaskCalendarChip({ task, propertyId }: TaskCalendarChipProps) {
  const [syncing,      setSyncing]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)

  const hasEvent      = (task.calendarEventIds?.length ?? 0) > 0 || !!task.calendarEventId
  const syncState     = task.calendarSyncState
  const propertyName  = getPropertyById(propertyId)?.name ?? propertyId

  async function handleClick() {
    if (syncing) return
    setError(null)

    if (isDev()) {
      // Dev mode: show dry-run popover for this single task
      setSyncing(true)
      try {
        const result = await syncAllToCalendar('dev_token', propertyId, propertyName, true) as DryRunResult
        setDryRunResult(result)
      } catch (err) {
        setError(String(err))
      } finally {
        setSyncing(false)
      }
      return
    }

    setSyncing(true)
    try {
      const token = await getValidToken()
      if (!token) { setError('Sign in to sync calendar'); return }
      await addTaskToCalendar(token, task, propertyName)
    } catch (err) {
      setError(String(err))
    } finally {
      setSyncing(false)
    }
  }

  if (syncState === 'error' || error) {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          title={error ?? task.calendarError ?? 'Calendar error — tap to retry'}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-50 border-red-200 text-red-700"
        >
          <AlertTriangle className="w-3 h-3" />
          Calendar error
        </button>
        {dryRunResult && <DryRunModal result={dryRunResult} onClose={() => setDryRunResult(null)} />}
      </>
    )
  }

  if (syncing) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 border-amber-200 text-amber-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        Syncing…
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
          hasEvent
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-white dark:bg-slate-800 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
        )}
      >
        {hasEvent ? (
          <><CalendarCheck className="w-3 h-3" /> On calendar</>
        ) : (
          <><CalendarPlus className="w-3 h-3" /> Add to calendar</>
        )}
      </button>
      {dryRunResult && <DryRunModal result={dryRunResult} onClose={() => setDryRunResult(null)} />}
    </>
  )
}
