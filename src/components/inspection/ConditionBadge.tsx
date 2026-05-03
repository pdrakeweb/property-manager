/**
 * 1–5 condition severity pill, used in inspection cards and trend lists.
 *
 * Color scale tuned to the existing red/orange/amber/emerald palette
 * elsewhere in the app. Users override severity via the
 * `userOverrideSeverity` field on Inspection — the override icon is
 * rendered here when supplied via `overridden`.
 */

import { cn } from '../../utils/cn'
import { SEVERITY_LABELS } from '../../lib/conditionAssessment'
import type { ConditionSeverity } from '../../lib/inspectionStore'

const SEVERITY_STYLE: Record<ConditionSeverity, string> = {
  1: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  2: 'bg-green-100   dark:bg-green-900/30   text-green-700   dark:text-green-300   border-green-200   dark:border-green-800',
  3: 'bg-amber-100   dark:bg-amber-900/30   text-amber-700   dark:text-amber-300   border-amber-200   dark:border-amber-800',
  4: 'bg-orange-100  dark:bg-orange-900/30  text-orange-700  dark:text-orange-300  border-orange-200  dark:border-orange-800',
  5: 'bg-red-100     dark:bg-red-900/30     text-red-700     dark:text-red-300     border-red-200     dark:border-red-800',
}

interface ConditionBadgeProps {
  severity:    ConditionSeverity
  label?:      string
  overridden?: boolean
  size?:       'sm' | 'md'
  className?:  string
}

export function ConditionBadge({ severity, label, overridden, size = 'md', className }: ConditionBadgeProps) {
  const text = label ?? SEVERITY_LABELS[severity]
  const sizeCls = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
    : 'text-xs px-2 py-1 gap-1'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-semibold border',
        SEVERITY_STYLE[severity],
        sizeCls,
        className,
      )}
      aria-label={`Condition severity ${severity} of 5: ${text}`}
    >
      <span className="tabular-nums">{severity}/5</span>
      <span>·</span>
      <span>{text}</span>
      {overridden && <span title="User override" className="opacity-70">✎</span>}
    </span>
  )
}
