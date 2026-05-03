/**
 * Conversation import — Phase A of the conversation-import + MCP plan.
 *
 * Two-tier parse:
 *   1. Fast path — find fenced ```task / purchase / completed / inventory /
 *      note blocks in the markdown and parse them directly. Zero API calls.
 *   2. LLM fallback — for prose that doesn't have well-formed blocks, send
 *      to OpenRouter with a strict json_schema response asking for the same
 *      shape. Used only when the fast path returns nothing.
 *
 * Both paths return the same `ImportPreview` shape so the review UI is
 * agnostic to which path produced the items.
 */

import { getOpenRouterKey } from '../store/settings'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4-6'

export type Confidence = 'high' | 'medium' | 'low'

export interface ImportTask {
  kind:           'task'
  title:          string
  category?:      string
  due?:           string
  estimatedCost?: number
  recurrence?:    'once' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
  priority?:      'low' | 'medium' | 'high' | 'critical'
  notes?:         string
  confidence:     Confidence
  rawText?:       string
}

export interface ImportPurchase {
  kind:           'purchase'
  title:          string
  category?:      string
  estimatedCost?: number
  vendor?:        string
  notes?:         string
  confidence:     Confidence
  rawText?:       string
}

export interface ImportCompleted {
  kind:          'completed'
  title:         string
  category?:     string
  dateCompleted?:string
  cost?:         number
  contractor?:   string
  notes?:        string
  confidence:    Confidence
  rawText?:      string
}

export interface ImportInventory {
  kind:          'inventory'
  title:         string
  category?:     string
  brand?:        string
  model?:        string
  installYear?:  number
  notes?:        string
  confidence:    Confidence
  rawText?:      string
}

export interface ImportNote {
  kind:       'note'
  title:      string
  body:       string
  confidence: Confidence
  rawText?:   string
}

export type ImportItem = ImportTask | ImportPurchase | ImportCompleted | ImportInventory | ImportNote

export interface ImportPreview {
  /** Property id parsed from frontmatter, if present. */
  propertyId?: string
  source:      'fenced-blocks' | 'llm' | 'empty'
  items:       ImportItem[]
}

// ─── Frontmatter ────────────────────────────────────────────────────────────

function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

// ─── Fenced block parser ────────────────────────────────────────────────────

const KIND_TAGS = ['task', 'purchase', 'completed', 'inventory', 'note'] as const
type KindTag = typeof KIND_TAGS[number]

function isKindTag(s: string): s is KindTag {
  return (KIND_TAGS as readonly string[]).includes(s)
}

interface RawBlock { kind: KindTag; body: string }

function findFencedBlocks(md: string): RawBlock[] {
  const out: RawBlock[] = []
  // Match ``` followed by a kind tag, then anything up to ``` on its own line.
  const re = /```(\w+)\s*\n([\s\S]*?)\n```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const tag = m[1].toLowerCase()
    if (!isKindTag(tag)) continue
    out.push({ kind: tag, body: m[2] })
  }
  return out
}

function parseKv(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
      // Strip quotes if the value is wrapped in them.
      .replace(/^["']|["']$/g, '')
    if (k) out[k] = v
  }
  return out
}

function asNumber(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number(v.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function asConfidence(v: string | undefined): Confidence {
  if (v === 'high' || v === 'medium' || v === 'low') return v
  return 'medium'
}

function blockToItem(b: RawBlock): ImportItem | null {
  const kv = parseKv(b.body)
  const conf = asConfidence(kv.confidence)
  const rawText = kv.raw_text || undefined

  if (b.kind === 'task') {
    if (!kv.title) return null
    const recurrence = ['once', 'weekly', 'monthly', 'quarterly', 'annually'].includes(kv.recurrence)
      ? (kv.recurrence as ImportTask['recurrence']) : undefined
    const priority = ['low', 'medium', 'high', 'critical'].includes(kv.priority)
      ? (kv.priority as ImportTask['priority']) : undefined
    return {
      kind: 'task', title: kv.title, category: kv.category, due: kv.due,
      estimatedCost: asNumber(kv.estimated_cost), recurrence, priority,
      notes: kv.notes, confidence: conf, rawText,
    }
  }
  if (b.kind === 'purchase') {
    if (!kv.title) return null
    return {
      kind: 'purchase', title: kv.title, category: kv.category,
      estimatedCost: asNumber(kv.estimated_cost), vendor: kv.vendor,
      notes: kv.notes, confidence: conf, rawText,
    }
  }
  if (b.kind === 'completed') {
    if (!kv.title) return null
    return {
      kind: 'completed', title: kv.title, category: kv.category,
      dateCompleted: kv.date_completed, cost: asNumber(kv.cost),
      contractor: kv.contractor, notes: kv.notes, confidence: conf, rawText,
    }
  }
  if (b.kind === 'inventory') {
    if (!kv.title) return null
    return {
      kind: 'inventory', title: kv.title, category: kv.category,
      brand: kv.brand, model: kv.model,
      installYear: asNumber(kv.install_year),
      notes: kv.notes, confidence: conf, rawText,
    }
  }
  if (b.kind === 'note') {
    if (!kv.title) return null
    return {
      kind: 'note', title: kv.title, body: kv.body ?? '',
      confidence: conf, rawText,
    }
  }
  return null
}

export function parseFromFencedBlocks(md: string): ImportPreview {
  const fm = parseFrontmatter(md)
  const blocks = findFencedBlocks(md)
  const items = blocks.map(blockToItem).filter((x): x is ImportItem => x !== null)
  return {
    propertyId: fm.property_id || undefined,
    source: items.length > 0 ? 'fenced-blocks' : 'empty',
    items,
  }
}

// ─── LLM fallback ──────────────────────────────────────────────────────────

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    property_id: { type: 'string' },
    tasks: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, category: { type: 'string' }, due: { type: 'string' },
        estimated_cost: { type: 'number' },
        recurrence: { type: 'string', enum: ['once', 'weekly', 'monthly', 'quarterly', 'annually'] },
        priority:   { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        notes: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        raw_text: { type: 'string' },
      },
      required: ['title', 'confidence'],
    }},
    purchases: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, category: { type: 'string' }, estimated_cost: { type: 'number' },
        vendor: { type: 'string' }, notes: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, raw_text: { type: 'string' },
      },
      required: ['title', 'confidence'],
    }},
    completed: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, category: { type: 'string' }, date_completed: { type: 'string' },
        cost: { type: 'number' }, contractor: { type: 'string' }, notes: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, raw_text: { type: 'string' },
      },
      required: ['title', 'confidence'],
    }},
    inventory: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, category: { type: 'string' },
        brand: { type: 'string' }, model: { type: 'string' },
        install_year: { type: 'number' }, notes: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, raw_text: { type: 'string' },
      },
      required: ['title', 'confidence'],
    }},
    notes: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, body: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, raw_text: { type: 'string' },
      },
      required: ['title', 'body', 'confidence'],
    }},
  },
  required: ['tasks', 'purchases', 'completed', 'inventory', 'notes'],
}

const SYSTEM_PROMPT =
  `You are extracting structured property-management records from a Claude conversation summary.
Extract ALL actionable items as one of: tasks (future maintenance), purchases (things to buy),
completed (work already done that should be logged), inventory (equipment to add), notes (general
observations). Each item gets a "confidence" score (high/medium/low) — use 'high' only for items
explicitly stated, 'medium' for inferred from context, 'low' for tentative.

Whenever possible, populate "raw_text" with the verbatim sentence the item was extracted from so
the user can verify. Return all five arrays even if some are empty.`

interface LlmResponse {
  property_id?: string
  tasks?:      Array<Record<string, unknown>>
  purchases?:  Array<Record<string, unknown>>
  completed?:  Array<Record<string, unknown>>
  inventory?:  Array<Record<string, unknown>>
  notes?:      Array<Record<string, unknown>>
}

function llmObjToItem(kind: ImportItem['kind'], obj: Record<string, unknown>): ImportItem | null {
  const get = (k: string): string | undefined => typeof obj[k] === 'string' ? obj[k] as string : undefined
  const num = (k: string): number | undefined => typeof obj[k] === 'number' ? obj[k] as number : undefined
  const conf = asConfidence(get('confidence'))
  const rawText = get('raw_text')
  const title = get('title')
  if (!title && kind !== 'note') return null
  switch (kind) {
    case 'task':
      return {
        kind, title: title!, category: get('category'), due: get('due'),
        estimatedCost: num('estimated_cost'),
        recurrence: get('recurrence') as ImportTask['recurrence'],
        priority:   get('priority')   as ImportTask['priority'],
        notes: get('notes'), confidence: conf, rawText,
      }
    case 'purchase':
      return {
        kind, title: title!, category: get('category'),
        estimatedCost: num('estimated_cost'), vendor: get('vendor'),
        notes: get('notes'), confidence: conf, rawText,
      }
    case 'completed':
      return {
        kind, title: title!, category: get('category'),
        dateCompleted: get('date_completed'), cost: num('cost'),
        contractor: get('contractor'), notes: get('notes'),
        confidence: conf, rawText,
      }
    case 'inventory':
      return {
        kind, title: title!, category: get('category'),
        brand: get('brand'), model: get('model'),
        installYear: num('install_year'), notes: get('notes'),
        confidence: conf, rawText,
      }
    case 'note': {
      const body = get('body')
      if (!title || !body) return null
      return { kind, title, body, confidence: conf, rawText }
    }
  }
}

export async function parseWithLlm(md: string, signal?: AbortSignal): Promise<ImportPreview> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new Error('No OpenRouter API key — configure one in Settings')

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
      max_tokens:  4096,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'ConversationImport', strict: true, schema: SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: md },
      ],
    }),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Conversation import extraction failed (${resp.status}): ${text.slice(0, 200)}`)
  }
  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
  let parsed: LlmResponse
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as LlmResponse
  } catch {
    throw new Error('AI returned malformed extraction')
  }

  const items: ImportItem[] = []
  for (const o of parsed.tasks     ?? []) { const it = llmObjToItem('task',      o); if (it) items.push(it) }
  for (const o of parsed.purchases ?? []) { const it = llmObjToItem('purchase',  o); if (it) items.push(it) }
  for (const o of parsed.completed ?? []) { const it = llmObjToItem('completed', o); if (it) items.push(it) }
  for (const o of parsed.inventory ?? []) { const it = llmObjToItem('inventory', o); if (it) items.push(it) }
  for (const o of parsed.notes     ?? []) { const it = llmObjToItem('note',      o); if (it) items.push(it) }

  return { propertyId: parsed.property_id, source: 'llm', items }
}

// ─── Combined entry point ──────────────────────────────────────────────────

export async function parseConversation(md: string, signal?: AbortSignal): Promise<ImportPreview> {
  const fast = parseFromFencedBlocks(md)
  if (fast.items.length > 0) return fast
  return parseWithLlm(md, signal)
}
