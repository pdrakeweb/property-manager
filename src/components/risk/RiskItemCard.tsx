/**
 * Single risk item — title, severity, reasoning, recommended action,
 * convert-to-maintenance / convert-to-capital buttons.
 */

import { Wrench, BarChart3, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RiskSeverityBadge } from './RiskSeverityBadge'
import { customTaskStore } from '../../lib/maintenanceStore'
import { capitalItemStore } from '../../lib/capitalItemStore'
import { riskBriefStore, type RiskItem, type PropertyRiskBrief } from '../../lib/riskBriefStore'
import { useToast } from '../Toast'

const SEVERITY_TO_PRIORITY = {
  critical: 'critical',
  high:     'high',
  medium:   'medium',
  low:      'low',
} as const

const SEVERITY_TO_DUE_DAYS: Record<string, number> = {
  critical: 7,
  high:     30,
  medium:   90,
  low:      180,
}

function dueDate(severity: keyof typeof SEVERITY_TO_PRIORITY): string {
  const days = SEVERITY_TO_DUE_DAYS[severity] ?? 90
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface RiskItemCardProps {
  brief: PropertyRiskBrief
  item:  RiskItem
  /** Called after a successful conversion so the parent can re-read the brief from store. */
  onChange?: () => void
}

export function RiskItemCard({ brief, item, onChange }: RiskItemCardProps) {
  const navigate = useNavigate()
  const toast    = useToast()

  const taskActioned    = !!item.convertedToTaskId
  const capitalActioned = !!item.convertedToCapitalItemId
  const anyActioned     = taskActioned || capitalActioned

  function persistConversion(updated: RiskItem) {
    const fresh: PropertyRiskBrief = {
      ...brief,
      risks: brief.risks.map(r => r.id === item.id ? updated : r),
    }
    riskBriefStore.update(fresh)
    onChange?.()
  }

  function addToMaintenance() {
    const taskId = `task_${Date.now()}`
    customTaskStore.add({
      id:          taskId,
      propertyId:  brief.propertyId,
      title:       item.suggestedTaskTitle ?? item.recommendedAction,
      systemLabel: item.categoryId ?? 'General',
      categoryId:  item.categoryId ?? 'service_record',
      dueDate:     dueDate(item.severity),
      priority:    SEVERITY_TO_PRIORITY[item.severity],
      status:      'upcoming',
      source:      'ai-suggested',
      notes:       `From risk brief — ${item.reasoning}`,
    })
    persistConversion({ ...item, convertedToTaskId: taskId })
    toast.success('Added to maintenance queue')
  }

  function addToCapital() {
    const id = crypto.randomUUID()
    capitalItemStore.add({
      id,
      propertyId:    brief.propertyId,
      title:         item.suggestedCapitalItemTitle ?? item.recommendedAction,
      categoryId:    item.categoryId ?? 'general',
      priority:      SEVERITY_TO_PRIORITY[item.severity],
      estimatedYear: new Date().getFullYear() + (item.severity === 'critical' || item.severity === 'high' ? 0 : 1),
      costLow:       item.estimatedCostLow  ?? 0,
      costHigh:      item.estimatedCostHigh ?? 0,
      notes:         item.reasoning,
      source:        'ai-suggested',
      status:        'planned',
    })
    persistConversion({ ...item, convertedToCapitalItemId: id })
    toast.success('Added to capital plan')
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{item.title}</h3>
        <RiskSeverityBadge severity={item.severity} />
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{item.reasoning}</p>

      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">Recommended action</p>
        <p className="text-xs text-slate-700 dark:text-slate-300">{item.recommendedAction}</p>
        {(item.estimatedCostLow !== undefined || item.estimatedCostHigh !== undefined) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Est. ${item.estimatedCostLow?.toLocaleString() ?? '?'}–${item.estimatedCostHigh?.toLocaleString() ?? '?'}
          </p>
        )}
      </div>

      {anyActioned ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
          <Check className="w-3.5 h-3.5" />
          {taskActioned    && <span>Added to maintenance.</span>}
          {capitalActioned && <span>Added to capital plan.</span>}
          <button
            onClick={() => navigate(taskActioned ? '/maintenance' : '/budget')}
            className="ml-auto text-xs font-medium hover:underline"
          >
            View →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={addToMaintenance} className="btn">
            <Wrench className="w-3.5 h-3.5" />
            Add to maintenance
          </button>
          <button onClick={addToCapital} className="btn">
            <BarChart3 className="w-3.5 h-3.5" />
            Add to capital plan
          </button>
        </div>
      )}
    </div>
  )
}
