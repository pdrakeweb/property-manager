/**
 * Predictive Failure Engine (Phase 3 §5).
 *
 * Serializes a property's full context via `propertyContextBuilder` and
 * asks Claude to identify 3–8 risk items the owner hasn't yet queued.
 * Returns a structured `PropertyRiskBrief` saved to localStorage.
 *
 * Cost is meaningful (~$0.10 per Opus run); callers should surface that
 * to the user before triggering.
 */

import { buildPropertyContext } from '../services/propertyContextBuilder'
import { getOpenRouterKey } from '../store/settings'
import { riskBriefStore, type PropertyRiskBrief, type RiskItem } from './riskBriefStore'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-opus-4-6'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    risks: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:                     { type: 'string' },
          categoryId:                { type: 'string' },
          severity:                  { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          reasoning:                 { type: 'string' },
          recommendedAction:         { type: 'string' },
          suggestedTaskTitle:        { type: 'string' },
          suggestedCapitalItemTitle: { type: 'string' },
          estimatedCostLow:          { type: 'number' },
          estimatedCostHigh:         { type: 'number' },
        },
        required: ['title', 'severity', 'reasoning', 'recommendedAction'],
      },
    },
  },
  required: ['risks'],
}

const SYSTEM_PROMPT = `You are an experienced property maintenance advisor analyzing a property owner's complete equipment and maintenance data.

Your task: identify systems or items showing risk factors that may not yet appear in the owner's maintenance queue. Focus on:
- Equipment approaching or past typical failure age for its category
- Maintenance gaps (no service records when expected intervals suggest service is due)
- Combinations of factors (e.g., old equipment + no recent service + abnormal HA readings)
- Items the owner has noted but not yet actioned

Do NOT repeat items already in the maintenance queue. Focus on gaps.
Return 3–8 risk items ordered by severity descending. Be specific: name the equipment, give the reasoning, cite the age or gap.

For each risk, also propose:
- suggestedTaskTitle: a one-line title suitable for a maintenance task (only when the action is a recurring or near-term service)
- suggestedCapitalItemTitle: a one-line title suitable for a capital project (only when the action is a major replacement)
- estimatedCostLow / estimatedCostHigh: typical replacement-cost range in USD when proposing a capital project. Use realistic 2026 contractor rates for residential/rural Ohio.`

export interface GenerateOptions {
  propertyId:   string
  driveToken?:  string | null
  signal?:      AbortSignal
}

export async function generateRiskBrief(opts: GenerateOptions): Promise<PropertyRiskBrief> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new Error('No OpenRouter API key — configure one in Settings')

  const context = await buildPropertyContext(opts.propertyId, opts.driveToken)

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title':      'Property Manager',
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  1500,
      temperature: 0.3,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'PropertyRiskBrief', strict: true, schema: SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Property data:\n\n${context}\n\nReturn the risk brief now.` },
      ],
    }),
    signal: opts.signal,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Risk brief failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { model?: string; choices?: Array<{ message?: { content?: string } }> }
  const raw  = data.choices?.[0]?.message?.content ?? ''
  let parsed: { risks: Omit<RiskItem, 'id'>[] }
  try {
    parsed = JSON.parse(raw) as { risks: Omit<RiskItem, 'id'>[] }
  } catch {
    throw new Error('AI returned malformed risk brief')
  }

  const brief: PropertyRiskBrief = {
    id:           crypto.randomUUID(),
    propertyId:   opts.propertyId,
    generatedAt:  new Date().toISOString(),
    modelUsed:    data.model || MODEL,
    inputSummary: context.slice(0, 400),
    risks:        parsed.risks.map(r => ({
      ...r,
      id: crypto.randomUUID(),
    })),
  }

  riskBriefStore.add(brief)
  return brief
}

/** Estimated cost text for the trigger UI. */
export const ESTIMATED_COST_LABEL = '~$0.10'
