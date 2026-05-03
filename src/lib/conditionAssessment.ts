/**
 * AI vision-based condition assessment (Phase 3 §2).
 *
 * Input: a photo blob + equipment context (brand/model/install year).
 * Output: structured `AiConditionAssessment` — severity 1–5, findings,
 * recommended action, urgency.
 *
 * Pattern matches `documentExtractor.ts`: base64-encode the blob, send
 * as a single user message with image_url + text content, request a
 * strict-schema JSON response.
 */

import { getOpenRouterKey } from '../store/settings'
import type { AiConditionAssessment } from './inspectionStore'
import type { EquipmentRecord, Category } from '../types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const MODEL = 'anthropic/claude-sonnet-4-6'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity:          { type: 'integer', minimum: 1, maximum: 5 },
    severityLabel:     { type: 'string' },
    summary:           { type: 'string' },
    findings:          { type: 'array', items: { type: 'string' } },
    recommendedAction: { type: 'string' },
    urgency:           { type: 'string', enum: ['immediate', 'within-30-days', 'within-6-months', 'annual', 'monitor'] },
    confidenceNote:    { type: 'string' },
  },
  required: ['severity', 'severityLabel', 'summary', 'findings', 'recommendedAction', 'urgency'],
}

const SYSTEM_PROMPT = `You are an experienced property maintenance inspector analyzing a photograph of equipment in service.

Analyze the visible condition and return:
- severity: integer 1–5 (1 = excellent/new, 2 = good, 3 = fair, 4 = poor, 5 = critical)
- severityLabel: a 1–2 word label matching the integer (e.g. "Moderate", "Critical")
- summary: 1–2 sentence overall summary
- findings: 2–5 bullet points of specific visible issues (corrosion, leaks, wear, paint condition, structural concerns). If no issues are visible, return "No visible issues."
- recommendedAction: one concrete next step the owner should take
- urgency: timeline category (immediate / within-30-days / within-6-months / annual / monitor)
- confidenceNote (optional): caveat if assessment is limited (e.g. "Unable to assess internal components from exterior photo")

Be conservative. Do NOT speculate about internal components not visible in the image. Cite the equipment age in your reasoning when an installation year is given.`

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

interface AssessOptions {
  blob:         Blob
  mimeType:     string
  equipment:    EquipmentRecord
  category?:    Category
  voiceNote?:   string
}

export async function assessCondition(opts: AssessOptions): Promise<AiConditionAssessment> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new Error('No OpenRouter API key — configure one in Settings')

  const base64 = await blobToBase64(opts.blob)
  const e = opts.equipment
  const ageYears = typeof e.age === 'number' ? `${e.age}-year-old` : ''
  const ident = [e.brand, e.model].filter(Boolean).join(' ').trim()
  const label = opts.category?.label ?? e.label ?? 'equipment'

  const lines: string[] = []
  lines.push(`Inspect this ${ageYears} ${label}`.replace(/\s+/g, ' ').trim() + (ident ? ` (${ident})` : '') + '.')
  if (e.installYear)  lines.push(`Installed: ${e.installYear}.`)
  if (e.location)     lines.push(`Location: ${e.location}.`)
  if (e.lastServiceDate) lines.push(`Last serviced: ${e.lastServiceDate}.`)
  if (opts.voiceNote) lines.push(`Owner's note: "${opts.voiceNote}".`)

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
      max_tokens:  1024,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'ConditionAssessment', strict: true, schema: SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${opts.mimeType};base64,${base64}` } },
            { type: 'text',      text: lines.join(' ') },
          ],
        },
      ],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Condition assessment failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { model?: string; choices?: Array<{ message?: { content?: string } }> }
  const raw  = data.choices?.[0]?.message?.content ?? ''
  let parsed: AiConditionAssessment
  try {
    const obj = JSON.parse(raw) as Omit<AiConditionAssessment, 'modelUsed'>
    parsed = { ...obj, modelUsed: data.model || MODEL }
  } catch {
    throw new Error('AI returned malformed assessment')
  }
  return parsed
}

/** Pretty severity label fallback if the model didn't supply one. */
export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Excellent',
  2: 'Good',
  3: 'Fair',
  4: 'Poor',
  5: 'Critical',
}
