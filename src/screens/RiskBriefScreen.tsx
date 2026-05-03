/**
 * Risk Brief screen (Phase 3 §5 — Predictive Failure Engine).
 *
 * Lists historical briefs for the active property; clicking one
 * expands the risk items inline. A "Run new review" button kicks
 * off generateRiskBrief() and surfaces cost / status to the user.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react'
import { useAppStore } from '../store/AppStoreContext'
import { propertyStore } from '../lib/propertyStore'
import { getOpenRouterKey } from '../store/settings'
import {
  riskBriefStore, getBriefsForProperty, severityOrder,
  type PropertyRiskBrief,
} from '../lib/riskBriefStore'
import { generateRiskBrief, ESTIMATED_COST_LABEL } from '../lib/riskEngine'
import { RiskItemCard } from '../components/risk/RiskItemCard'
import { RiskSeverityBadge } from '../components/risk/RiskSeverityBadge'
import { useToast } from '../components/Toast'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function RiskBriefScreen() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { activePropertyId } = useAppStore()
  const property = propertyStore.getById(activePropertyId)

  const [briefs, setBriefs] = useState<PropertyRiskBrief[]>(() => getBriefsForProperty(activePropertyId))
  const [running, setRunning] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(briefs[0]?.id ?? null)
  const [error, setError] = useState('')

  // Refresh when active property changes.
  useEffect(() => {
    setBriefs(getBriefsForProperty(activePropertyId))
    setExpandedId(null)
  }, [activePropertyId])

  const hasKey = !!getOpenRouterKey()

  async function runNow() {
    setError('')
    setRunning(true)
    try {
      const brief = await generateRiskBrief({ propertyId: activePropertyId })
      // Sort risks by severity (critical first) for display.
      brief.risks.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
      riskBriefStore.update(brief)
      setBriefs(getBriefsForProperty(activePropertyId))
      setExpandedId(brief.id)
      toast.success(`Risk brief generated — ${brief.risks.length} items`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(`Risk brief failed: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  function deleteBrief(id: string) {
    riskBriefStore.remove(id)
    setBriefs(getBriefsForProperty(activePropertyId))
    if (expandedId === id) setExpandedId(null)
  }

  const expanded = useMemo(() => briefs.find(b => b.id === expandedId), [briefs, expandedId])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          Predictive Risk Brief
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {property ? `For ${property.shortName ?? property.name}.` : ''} Quarterly AI review of equipment ages,
          maintenance gaps, and combinations of factors that suggest hidden risk.
        </p>
      </div>

      {/* Run button */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex items-center gap-3">
        {running ? (
          <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
        ) : (
          <Sparkles className="w-5 h-5 text-sky-500" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {running ? 'Analyzing property data…' : 'Run a new review'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Estimated cost {ESTIMATED_COST_LABEL} · uses Claude Opus via OpenRouter
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running || !hasKey}
          className="btn btn-primary"
          title={hasKey ? '' : 'Add an OpenRouter API key in Settings'}
        >
          Run now
        </button>
      </div>

      {!hasKey && (
        <p className="text-xs text-amber-700 dark:text-amber-400 -mt-3">
          Add an OpenRouter API key in <button className="underline" onClick={() => navigate('/settings')}>Settings → AI</button> to enable risk briefs.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* History */}
      {briefs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No risk briefs yet.</p>
          <p className="text-xs">Run your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="section-title">History ({briefs.length})</h2>
          {briefs.map(b => {
            const isOpen = expandedId === b.id
            const counts = b.risks.reduce<Record<string, number>>((acc, r) => {
              acc[r.severity] = (acc[r.severity] ?? 0) + 1
              return acc
            }, {})
            return (
              <div key={b.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : b.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-2xl transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatDate(b.generatedAt)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {b.risks.length} item{b.risks.length === 1 ? '' : 's'}
                      {' · '}
                      {(['critical', 'high', 'medium', 'low'] as const)
                        .filter(s => counts[s])
                        .map(s => `${counts[s]} ${s}`)
                        .join(', ')}
                    </p>
                  </div>
                  {(['critical', 'high'] as const).map(s => counts[s] ? (
                    <RiskSeverityBadge key={s} severity={s} />
                  ) : null)}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {isOpen && expanded && expanded.id === b.id && (
                  <div className="border-t border-slate-100 dark:border-slate-700/50 px-4 py-4 space-y-3">
                    {expanded.risks.map(r => (
                      <RiskItemCard
                        key={r.id}
                        brief={expanded}
                        item={r}
                        onChange={() => setBriefs(getBriefsForProperty(activePropertyId))}
                      />
                    ))}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-2">
                      <span>Model: {expanded.modelUsed}</span>
                      <button onClick={() => deleteBrief(expanded.id)} className="hover:text-red-500 transition-colors">Delete brief</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
