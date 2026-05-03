/**
 * Color-coded severity pill for risk items: low / medium / high / critical.
 */

import { cn } from '../../utils/cn'
import type { RiskSeverity } from '../../lib/riskBriefStore'

const STYLE: Record<RiskSeverity, string> = {
  low:      'bg-slate-100  dark:bg-slate-700        text-slate-600  dark:text-slate-300  border-slate-200  dark:border-slate-600',
  medium:   'bg-amber-100  dark:bg-amber-900/30     text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800',
  high:     'bg-orange-100 dark:bg-orange-900/30    text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  critical: 'bg-red-100    dark:bg-red-900/30       text-red-700    dark:text-red-300    border-red-200    dark:border-red-800',
}

export function RiskSeverityBadge({ severity, className }: { severity: RiskSeverity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide border',
        STYLE[severity],
        className,
      )}
    >
      {severity}
    </span>
  )
}
