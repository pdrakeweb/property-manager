/**
 * Modal that shows the raw transcript + AI-parsed fields and lets the
 * user tweak before applying. Used by VoiceMemoButton.
 */

import { useEffect, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { useModalA11y } from '../../lib/focusTrap'
import { parseVoiceMemo, type ParsedVoiceMemo } from '../../lib/voiceMemoParser'
import { getOpenRouterKey } from '../../store/settings'

interface VoiceMemoReviewProps {
  transcript: string
  contextHint?: string
  onClose: () => void
  onApply: (parsed: ParsedVoiceMemo) => void
}

export function VoiceMemoReview({ transcript, contextHint, onClose, onApply }: VoiceMemoReviewProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)
  const hasKey = !!getOpenRouterKey()

  const [parsing, setParsing] = useState(hasKey)
  const [text, setText]       = useState(transcript)
  const [parsed, setParsed]   = useState<ParsedVoiceMemo>({ workDone: transcript })

  useEffect(() => {
    let cancelled = false
    if (!hasKey) {
      setParsed({ workDone: transcript })
      return
    }
    parseVoiceMemo(transcript, contextHint).then(p => {
      if (cancelled) return
      setParsed(p)
      setText(p.workDone)
      setParsing(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleApply() {
    onApply({ ...parsed, workDone: text.trim() || transcript.trim() })
  }

  const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2 transition-all'

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-memo-review-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="voice-memo-review-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            Voice memo
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Raw transcript — always editable */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Description</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            className={inp}
          />
        </div>

        {/* AI-parsed fields */}
        {parsing ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Parsing memo…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {parsed.system !== undefined && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">System</label>
                <input type="text" value={parsed.system ?? ''} onChange={e => setParsed(p => ({ ...p, system: e.target.value }))} className={inp} />
              </div>
            )}
            {parsed.duration !== undefined && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Duration</label>
                <input type="text" value={parsed.duration ?? ''} onChange={e => setParsed(p => ({ ...p, duration: e.target.value }))} className={inp} />
              </div>
            )}
            {parsed.cost !== undefined && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Cost ($)</label>
                <input type="number" value={parsed.cost ?? ''} onChange={e => setParsed(p => ({ ...p, cost: e.target.value === '' ? undefined : Number(e.target.value) }))} className={inp} />
              </div>
            )}
            {parsed.contractor !== undefined && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contractor</label>
                <input type="text" value={parsed.contractor ?? ''} onChange={e => setParsed(p => ({ ...p, contractor: e.target.value }))} className={inp} />
              </div>
            )}
            {parsed.followUpNeeded && (
              <div className="col-span-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Follow-up needed</p>
                {parsed.followUpNote && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{parsed.followUpNote}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn flex-1">Cancel</button>
          <button onClick={handleApply} disabled={parsing} className="btn btn-primary flex-1">
            Use this
          </button>
        </div>
      </div>
    </div>
  )
}
