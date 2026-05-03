/**
 * Render an AI condition assessment as a structured card —
 * severity badge, summary, findings list, recommended action,
 * urgency, optional confidence note.
 */

import { Sparkles, AlertTriangle } from 'lucide-react'
import { ConditionBadge } from './ConditionBadge'
import type { AiConditionAssessment } from '../../lib/inspectionStore'

const URGENCY_LABEL: Record<AiConditionAssessment['urgency'], string> = {
  immediate:        'Immediate',
  'within-30-days': 'Within 30 days',
  'within-6-months':'Within 6 months',
  annual:           'Annual review',
  monitor:          'Monitor',
}

interface AiAssessmentCardProps {
  assessment: AiConditionAssessment
  /** When supplied, shows that the user overrode the AI severity. */
  userOverrideSeverity?: 1 | 2 | 3 | 4 | 5
}

export function AiAssessmentCard({ assessment, userOverrideSeverity }: AiAssessmentCardProps) {
  const effective = userOverrideSeverity ?? assessment.severity

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <ConditionBadge
          severity={effective}
          label={effective === assessment.severity ? assessment.severityLabel : undefined}
          overridden={userOverrideSeverity != null}
        />
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <Sparkles className="w-3 h-3 text-sky-500" />
          AI assessment
        </span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{assessment.summary}</p>

      {assessment.findings.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Findings</p>
          <ul className="space-y-1">
            {assessment.findings.map((f, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-300 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-400">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Recommended action</p>
          <p className="text-xs text-slate-700 dark:text-slate-300">{assessment.recommendedAction}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Urgency</p>
          <p className="text-xs text-slate-700 dark:text-slate-300">{URGENCY_LABEL[assessment.urgency] ?? assessment.urgency}</p>
        </div>
      </div>

      {assessment.confidenceNote && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">{assessment.confidenceNote}</p>
        </div>
      )}

      <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">Model: {assessment.modelUsed}</p>
    </div>
  )
}
