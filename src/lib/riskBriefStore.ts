/**
 * Local store for predictive-failure risk briefs (Phase 3 §5).
 *
 * Same simple-localStorage pattern as inspectionStore — DSL/Drive sync
 * is a clean follow-up. One brief per generation, history is the full
 * list ordered most-recent first.
 */

import { makeStore } from './localStore'

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface RiskItem {
  id:                       string
  title:                    string
  categoryId?:              string
  severity:                 RiskSeverity
  reasoning:                string
  recommendedAction:        string
  suggestedTaskTitle?:      string
  suggestedCapitalItemTitle?: string
  estimatedCostLow?:        number
  estimatedCostHigh?:       number
  /** Once converted, blocks the convert buttons and shows "Actioned". */
  convertedToTaskId?:        string
  convertedToCapitalItemId?: string
}

export interface PropertyRiskBrief {
  id:           string
  propertyId:   string
  generatedAt:  string
  modelUsed:    string
  /** First ~400 chars of the serialized prompt — for transparency. */
  inputSummary: string
  risks:        RiskItem[]
}

export const riskBriefStore = makeStore<PropertyRiskBrief>('pm_risk_briefs')

export function getBriefsForProperty(propertyId: string): PropertyRiskBrief[] {
  return riskBriefStore.getAll()
    .filter(b => b.propertyId === propertyId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}

export function getLatestBrief(propertyId: string): PropertyRiskBrief | undefined {
  return getBriefsForProperty(propertyId)[0]
}

export function severityOrder(s: RiskSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s]
}
