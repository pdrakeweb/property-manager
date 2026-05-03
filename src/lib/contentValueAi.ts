/**
 * AI vision-based current-market-value estimate for a Content Item.
 *
 * Pattern matches `conditionAssessment.ts`: send photo(s) and item context
 * (name, brand, model, condition) to Claude vision via OpenRouter; ask for
 * a structured JSON estimate of current replacement value, plus a brief
 * rationale. Throws when no API key is configured so the caller can show
 * a graceful "configure your key in Settings" message.
 */

import { getOpenRouterKey } from '../store/settings'
import { contentCategoryLabel, type ContentItem } from '../records/contentItem'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL          = 'anthropic/claude-sonnet-4-6'

// Strict-mode JSON schema: keep types and `enum` only; constraints like
// `minimum` are unsupported by Anthropic's strict structured-output validator
// and trigger a 400 if included on `number` fields. Bound checks happen
// client-side after parsing.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    estimatedValue: { type: 'number' },
    confidence:     { type: 'string', enum: ['high', 'medium', 'low'] },
    valueRange: {
      type: 'object',
      additionalProperties: false,
      properties: {
        low:  { type: 'number' },
        high: { type: 'number' },
      },
      required: ['low', 'high'],
    },
    rationale: { type: 'string' },
    notes:     { type: 'string' },
  },
  required: ['estimatedValue', 'confidence', 'valueRange', 'rationale', 'notes'],
}

const SYSTEM_PROMPT = `You estimate the current US replacement value of a personal-property item, suitable for an insurance contents claim.

Use the photograph(s) and any provided context (name, brand, model, age, condition) to ground your estimate. Return:
- estimatedValue: a single point estimate in US dollars (number, no symbols)
- valueRange: low and high bounds reflecting market spread for this item in similar condition
- confidence: high / medium / low — based on how identifiable the item is and how broad the market spread is
- rationale: 1–2 sentences explaining the estimate (visible identifiers, condition cues, comparable market data you can point to)
- notes (optional): caveats, e.g. "appraisal recommended" for jewelry/art, or "value depends on regional demand"

Be conservative when identification is uncertain. Do not invent serial numbers or models that aren't visible. For jewelry, fine art, and antiques, suggest a professional appraisal in notes.`

export interface ContentValueEstimate {
  estimatedValue: number
  confidence:     'high' | 'medium' | 'low'
  valueRange:     { low: number; high: number }
  rationale:      string
  notes?:         string
  modelUsed:      string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

interface EstimateOptions {
  /** Inline photos as data: URLs (preferred — what the screen already has). */
  photoDataUrls?: string[]
  /** Or a fresh blob captured from a file input. */
  blob?:     Blob
  mimeType?: string
  item:      ContentItem
}

export async function estimateContentValue(opts: EstimateOptions): Promise<ContentValueEstimate> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new Error('No OpenRouter API key — configure one in Settings')

  // Build the image content blocks. Prefer photoDataUrls (what's already on
  // the record); fall back to the explicit blob path for fresh captures.
  const images: Array<{ type: 'image_url'; image_url: { url: string } }> = []
  if (opts.photoDataUrls && opts.photoDataUrls.length > 0) {
    for (const url of opts.photoDataUrls.slice(0, 4)) {
      // Only send URLs that look like base64 data URLs; skip Drive ids etc.
      if (url.startsWith('data:')) images.push({ type: 'image_url', image_url: { url } })
    }
  } else if (opts.blob && opts.mimeType) {
    const base64 = await blobToBase64(opts.blob)
    images.push({ type: 'image_url', image_url: { url: `data:${opts.mimeType};base64,${base64}` } })
  }

  if (images.length === 0) {
    throw new Error('Add at least one photo before requesting an AI value estimate')
  }

  const i = opts.item
  const ident = [i.brand, i.model].filter(Boolean).join(' ').trim()
  const lines: string[] = []
  lines.push(`Item: ${i.name}${ident ? ` (${ident})` : ''}.`)
  lines.push(`Category: ${contentCategoryLabel(i.category)}.`)
  if (i.purchaseDate)  lines.push(`Purchased: ${i.purchaseDate}.`)
  if (i.purchasePrice != null) lines.push(`Original price: $${i.purchasePrice}.`)
  if (i.serialNumber)  lines.push(`Serial: ${i.serialNumber}.`)
  if (i.condition)     lines.push(`Condition (1–5, 5=best): ${i.condition}.`)
  if (i.location)      lines.push(`Location: ${i.location}.`)
  if (i.notes)         lines.push(`Owner's notes: ${i.notes}.`)

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
        json_schema: { name: 'ContentValueEstimate', strict: true, schema: SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            ...images,
            { type: 'text', text: lines.join(' ') },
          ],
        },
      ],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Value estimate failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { model?: string; choices?: Array<{ message?: { content?: string } }> }
  const raw  = data.choices?.[0]?.message?.content ?? ''
  let parsed: Omit<ContentValueEstimate, 'modelUsed'>
  try {
    parsed = JSON.parse(raw) as Omit<ContentValueEstimate, 'modelUsed'>
  } catch {
    throw new Error('AI returned malformed value estimate')
  }
  return { ...parsed, modelUsed: data.model || MODEL }
}
