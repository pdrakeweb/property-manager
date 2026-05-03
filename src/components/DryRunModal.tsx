import { X, CalendarPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { DryRunResult } from '../lib/calendarClient'
import { cn } from '../utils/cn'
import { useModalA11y } from '../lib/focusTrap'

interface DryRunModalProps {
  result:  DryRunResult
  onClose: () => void
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function DryRunModal({ result, onClose }: DryRunModalProps) {
  const { toCreate, toUpdate, toDelete, summary } = result
  const isEmpty = summary.willCreate === 0 && summary.willUpdate === 0 && summary.willDelete === 0
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dry-run-modal-title"
        className="modal-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
      >

        {/* Header */}
        <div className="sticky top-0 bg-sky-600 rounded-t-2xl px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p id="dry-run-modal-title" className="text-white font-bold text-sm">DEV MODE — Calendar Preview</p>
            <p className="text-sky-200 text-xs mt-0.5">
              Not sent — sign in with Google to sync these to your calendar.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-sky-200 hover:text-white shrink-0 p-1 -m-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {isEmpty ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Nothing to sync — all tasks are up to date.
            </p>
          ) : (
            <>
              {toCreate.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-700 mb-2">
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Would CREATE ({toCreate.length})
                  </div>
                  <div className="space-y-2">
                    {toCreate.map((item, i) => {
                      const ev = item.event as Record<string, unknown>
                      return (
                        <div key={i} className="border border-sky-200 rounded-xl px-3 py-2.5 text-xs space-y-0.5 bg-sky-50">
                          <p className="font-semibold text-slate-800">{String(ev['summary'] ?? item.taskId)}</p>
                          {!!ev['start'] && (
                            <p className="text-slate-600">
                              {formatDate(String((ev['start'] as { date: string }).date))}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {toUpdate.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Would UPDATE ({toUpdate.length})
                  </div>
                  <div className="space-y-2">
                    {toUpdate.map((item, i) => {
                      const ev = item.replacement as Record<string, unknown>
                      return (
                        <div key={i} className="border border-amber-200 rounded-xl px-3 py-2.5 text-xs space-y-0.5 bg-amber-50">
                          <p className="font-semibold text-slate-800">{String(ev['summary'] ?? item.taskId)}</p>
                          <p className="text-slate-600">
                            {item.existing.start.date !== (ev['start'] as { date: string } | undefined)?.date ? (
                              <>
                                <span className={cn('line-through text-slate-400')}>{formatDate(item.existing.start.date)}</span>
                                {' → '}
                                {formatDate(String((ev['start'] as { date: string }).date))}
                              </>
                            ) : (
                              item.reason
                            )}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {toDelete.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    Would DELETE ({toDelete.length})
                  </div>
                  <div className="space-y-2">
                    {toDelete.map((item, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs space-y-0.5 bg-slate-50">
                        <p className="font-semibold text-slate-800">{item.eventId}</p>
                        <p className="text-slate-400">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-block"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
