/**
 * AI-powered checklist augmentation.
 *
 * Takes a baseline seasonal template and the property context (narrative,
 * equipment, climate), asks the model for additional items that are specific
 * to *this* property, and stores them alongside the baseline.
 */

import { chatCompletion } from './openRouterClient'
import { buildPropertyContext } from './propertyContextBuilder'
import { getOpenRouterKey, getModelForTask } from '../store/settings'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'
import { saveCustomSet } from '../lib/checklistCustomStore'
import { saveAdhocTemplate, findTemplate } from '../lib/checklistTemplateStore'
import type {
  ChecklistItem,
  ChecklistCustomSet,
  ChecklistTemplate,
  PropertyType,
  Season,
} from '../types/checklist'

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6'

// ─── JSON schemas for OpenRouter structured output ───────────────────────────
// Using response_format={type:'json_schema', strict:true} forces the model to
// emit JSON that matches the schema, eliminating malformed / truncated output
// that plain json_object mode can still exhibit on long responses.

const ITEMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'detail', 'category', 'estimatedMinutes'],
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
          category: { type: 'string' },
          estimatedMinutes: { type: 'integer' },
        },
      },
    },
  },
} as const

const SUGGESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['additions', 'edits', 'removals'],
  properties: {
    additions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'detail', 'category', 'estimatedMinutes', 'rationale'],
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
          category: { type: 'string' },
          estimatedMinutes: { type: 'integer' },
          rationale: { type: 'string' },
        },
      },
    },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'label', 'detail', 'category', 'estimatedMinutes', 'rationale'],
        properties: {
          itemId: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
          category: { type: 'string' },
          estimatedMinutes: { type: 'integer' },
          rationale: { type: 'string' },
        },
      },
    },
    removals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'rationale'],
        properties: {
          itemId: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
  },
} as const

export class ChecklistGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'ChecklistGenerationError'
  }
}

// ─── Prompt construction ─────────────────────────────────────────────────────

function baselineSummary(templateId: string, propertyType: PropertyType): string {
  const template = findTemplate(templateId) ?? CHECKLIST_TEMPLATES.find(t => t.id === templateId)
  if (!template) return ''
  const items = template.items.filter(i => i.applicableTo.includes(propertyType))
  return items.map(i => `- [${i.category}] ${i.label}`).join('\n')
}

function buildAugmentSystemPrompt(season: Season, propertyType: PropertyType): string {
  return [
    `You are a property maintenance expert augmenting a seasonal ${season} checklist for a ${propertyType}.`,
    `You will be given the baseline checklist (shared across all properties) and a detailed description of THIS property's equipment, narrative, and context.`,
    `Your job: propose additional checklist items that are specific to this property's actual equipment and situation, that the baseline does NOT already cover.`,
    ``,
    `Rules:`,
    `- Only suggest items that are clearly relevant to the ${season} season.`,
    `- Do NOT duplicate anything in the baseline list, even if worded differently.`,
    `- Anchor each item to a specific piece of equipment, narrative detail, or inventory record whenever possible.`,
    `- Prefer concrete, actionable tasks (verbs, target systems, measurable outcomes) over vague reminders.`,
    `- 3 to 10 items is ideal. Quality over quantity. If the property context is sparse, return fewer.`,
    `- Respond with JSON ONLY, no prose, no markdown fences. Schema:`,
    `  { "items": [ { "label": string, "detail": string, "category": string, "estimatedMinutes": number } ] }`,
    `- "category" should reuse one of the baseline categories where possible (e.g. "HVAC", "Plumbing / Water", "Exterior", "Generator", "Septic", "Water Treatment", "Grounds", "Safety").`,
    `- "detail" is a 1-3 sentence hint with specifics (brand/model/location when known).`,
    `- "estimatedMinutes" is a realistic integer.`,
  ].join('\n')
}

function buildAugmentUserPrompt(
  season: Season,
  propertyType: PropertyType,
  templateId: string,
  propertyContext: string,
): string {
  return [
    `BASELINE ${season.toUpperCase()} CHECKLIST (already covered — do not duplicate):`,
    baselineSummary(templateId, propertyType) || '(empty)',
    ``,
    `─── PROPERTY CONTEXT ───`,
    propertyContext,
    ``,
    `Return JSON only.`,
  ].join('\n')
}

function buildAdhocSystemPrompt(
  name: string,
  description: string,
  propertyType: PropertyType,
): string {
  return [
    `You are a property maintenance expert building a checklist called "${name}" for a ${propertyType}.`,
    `Purpose: ${description}`,
    `You will be given a detailed description of THIS property's equipment, narrative, and context.`,
    `Your job: produce a thorough, actionable checklist specific to this property and this purpose.`,
    ``,
    `Rules:`,
    `- Anchor each item to a specific piece of equipment, narrative detail, or inventory record whenever possible.`,
    `- Prefer concrete, actionable tasks (verbs, target systems, measurable outcomes) over vague reminders.`,
    `- Group items by category. Reuse familiar categories where they fit: "HVAC", "Plumbing / Water", "Exterior", "Generator", "Septic", "Water Treatment", "Grounds", "Safety", "Electrical", "Security", "Preparation". Invent new categories only when none fit.`,
    `- 5 to 20 items is ideal. Quality over quantity.`,
    `- Items should be ordered roughly in the sequence someone would actually do them.`,
    `- Respond with JSON ONLY, no prose, no markdown fences. Schema:`,
    `  { "items": [ { "label": string, "detail": string, "category": string, "estimatedMinutes": number } ] }`,
    `- "detail" is a 1-3 sentence hint with specifics (brand/model/location when known).`,
    `- "estimatedMinutes" is a realistic integer.`,
  ].join('\n')
}

function buildAdhocUserPrompt(
  name: string,
  description: string,
  propertyContext: string,
): string {
  return [
    `CHECKLIST NAME: ${name}`,
    `PURPOSE / SCENARIO: ${description}`,
    ``,
    `─── PROPERTY CONTEXT ───`,
    propertyContext,
    ``,
    `Generate the full checklist now. Return JSON only.`,
  ].join('\n')
}

// ─── Response parsing ────────────────────────────────────────────────────────

interface RawItem {
  label?: unknown
  detail?: unknown
  category?: unknown
  estimatedMinutes?: unknown
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return '{}'

  // 1. Strip ```json ... ``` fences (prefer this first — most common failure mode).
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()

  // 2. If it already starts with `{` or `[`, use it directly.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed

  // 3. Walk the string for the outermost balanced JSON object/array.
  //    Handles prose-before / prose-after and nested braces.
  const openIdx = Math.min(
    ...['{', '['].map(c => {
      const i = trimmed.indexOf(c)
      return i === -1 ? Infinity : i
    }),
  )
  if (!Number.isFinite(openIdx)) return '{}'

  const open = trimmed[openIdx]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = openIdx; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return trimmed.slice(openIdx, i + 1)
    }
  }

  // 4. Last resort: first `{` to last `}`.
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function parseItems(
  raw: string,
  templateId: string,
  propertyType: PropertyType,
): ChecklistItem[] {
  let parsed: { items?: RawItem[] }
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (e) {
    console.error('[checklistGenerator] Raw model output:', raw)
    const head = raw.slice(0, 160)
    const tail = raw.length > 320 ? raw.slice(-160) : ''
    throw new ChecklistGenerationError(
      `Model did not return valid JSON (length ${raw.length}). Start: ${head}${tail ? ` … End: ${tail}` : ''}`,
      e,
    )
  }
  // Some models wrap under alternate keys; accept a few common shapes.
  const rawArr = (Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: RawItem[] }).items
    : Array.isArray((parsed as unknown as { checklist?: unknown }).checklist) ? (parsed as unknown as { checklist: RawItem[] }).checklist
    : Array.isArray(parsed as unknown as RawItem[]) ? (parsed as unknown as RawItem[])
    : undefined)
  if (!rawArr) {
    console.error('[checklistGenerator] Raw JSON had no items:', parsed)
    throw new ChecklistGenerationError('Response missing "items" array')
  }
  parsed = { items: rawArr }
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new ChecklistGenerationError('Response missing "items" array')
  }

  const now = Date.now()
  const out: ChecklistItem[] = []
  parsed.items.forEach((r, idx) => {
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    if (!label) return
    const category = typeof r.category === 'string' && r.category.trim()
      ? r.category.trim()
      : 'Property-Specific'
    const detail = typeof r.detail === 'string' ? r.detail.trim() : undefined
    const estimatedMinutes = typeof r.estimatedMinutes === 'number'
      ? Math.round(r.estimatedMinutes)
      : undefined
    out.push({
      id: `ai_${templateId}_${now}_${idx}`,
      label,
      detail,
      category,
      applicableTo: [propertyType],
      estimatedMinutes,
      source: 'ai',
    })
  })
  return out
}

// ─── Context hash (for drift detection, optional use later) ──────────────────

function hashContext(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// ─── Main entry point ────────────────────────────────────────────────────────

export interface GenerateResult {
  items: ChecklistItem[]
  model: string
}

export async function generateChecklistAugmentations(
  propertyId: string,
  templateId: string,
  propertyType: PropertyType,
  driveToken?: string | null,
): Promise<GenerateResult> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) {
    throw new ChecklistGenerationError(
      'OpenRouter API key not configured. Set it in Settings.',
    )
  }

  const template = CHECKLIST_TEMPLATES.find(t => t.id === templateId)
  if (!template) {
    throw new ChecklistGenerationError(`Unknown checklist template: ${templateId}`)
  }
  if (!template.season) {
    throw new ChecklistGenerationError(`Template ${templateId} has no season — use regenerateAdhocChecklist instead`)
  }
  const season: Season = template.season

  const propertyContext = await buildPropertyContext(propertyId, driveToken)
  const model = getModelForTask('checklistGen', DEFAULT_MODEL)

  const result = await chatCompletion({
    apiKey,
    model,
    temperature: 0.4,
    maxTokens: 8192,
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: 'ChecklistItems', strict: true, schema: ITEMS_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: buildAugmentSystemPrompt(season, propertyType) },
      { role: 'user', content: buildAugmentUserPrompt(season, propertyType, templateId, propertyContext) },
    ],
  })

  const items = parseItems(result.content, templateId, propertyType)

  const set: ChecklistCustomSet = {
    id: `${propertyId}_${templateId}`,
    propertyId,
    templateId,
    items,
    generatedFrom: hashContext(propertyContext),
    generatedAt: new Date().toISOString(),
    model: result.model,
  }
  saveCustomSet(set)

  return { items, model: result.model }
}

// ─── Adhoc (arbitrary topic) generator ───────────────────────────────────────

export interface CreateAdhocOptions {
  propertyId: string
  propertyType: PropertyType
  name: string
  description: string
  driveToken?: string | null
}

export interface AdhocResult {
  template: ChecklistTemplate
  model: string
}

/**
 * Generate a brand-new adhoc checklist template from a name + description.
 * Saves it to the adhoc template store and returns it.
 */
export async function createAdhocChecklist(
  opts: CreateAdhocOptions,
): Promise<AdhocResult> {
  const { propertyId, propertyType, name, description, driveToken } = opts
  const apiKey = getOpenRouterKey()
  if (!apiKey) {
    throw new ChecklistGenerationError(
      'OpenRouter API key not configured. Set it in Settings.',
    )
  }
  if (!name.trim()) throw new ChecklistGenerationError('Checklist name is required')
  if (!description.trim()) throw new ChecklistGenerationError('Description is required')

  const propertyContext = await buildPropertyContext(propertyId, driveToken)
  const model = getModelForTask('checklistGen', DEFAULT_MODEL)

  const templateId = `adhoc_${propertyId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  const result = await chatCompletion({
    apiKey,
    model,
    temperature: 0.5,
    maxTokens: 8192,
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: 'ChecklistItems', strict: true, schema: ITEMS_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: buildAdhocSystemPrompt(name, description, propertyType) },
      { role: 'user',   content: buildAdhocUserPrompt(name, description, propertyContext) },
    ],
  })

  const items = parseItems(result.content, templateId, propertyType)
    // mark items as ai-generated so UI can badge them
    .map(i => ({ ...i, source: 'ai' as const }))

  if (items.length === 0) {
    throw new ChecklistGenerationError(
      'The model did not return any items. Try a more specific description.',
    )
  }

  const now = new Date().toISOString()
  const template: ChecklistTemplate = {
    id: templateId,
    kind: 'adhoc',
    origin: 'ai',
    name: name.trim(),
    description: description.trim(),
    items,
    propertyId,
    createdAt: now,
    updatedAt: now,
  }
  saveAdhocTemplate(template)

  return { template, model: result.model }
}

/**
 * Regenerate items for an existing adhoc template in-place (same id).
 * Useful when property narrative/equipment has evolved.
 */
export async function regenerateAdhocChecklist(
  templateId: string,
  driveToken?: string | null,
): Promise<AdhocResult> {
  const existing = findTemplate(templateId)
  if (!existing || existing.kind !== 'adhoc' || !existing.propertyId) {
    throw new ChecklistGenerationError(`Not an adhoc template: ${templateId}`)
  }
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new ChecklistGenerationError('OpenRouter API key not configured')

  // Infer property type from the existing items' applicableTo. All adhoc items
  // are written with a single propertyType (see createAdhocChecklist), but be
  // defensive in case.
  const propertyType: PropertyType =
    existing.items[0]?.applicableTo[0] ?? 'residence'

  const propertyContext = await buildPropertyContext(existing.propertyId, driveToken)
  const model = getModelForTask('checklistGen', DEFAULT_MODEL)

  const result = await chatCompletion({
    apiKey,
    model,
    temperature: 0.5,
    maxTokens: 8192,
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: 'ChecklistItems', strict: true, schema: ITEMS_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: buildAdhocSystemPrompt(existing.name, existing.description ?? '', propertyType) },
      { role: 'user',   content: buildAdhocUserPrompt(existing.name, existing.description ?? '', propertyContext) },
    ],
  })

  const items = parseItems(result.content, templateId, propertyType)
    .map(i => ({ ...i, source: 'ai' as const }))

  if (items.length === 0) {
    throw new ChecklistGenerationError('The model returned no items')
  }

  const template: ChecklistTemplate = {
    ...existing,
    origin: 'ai',
    items,
    updatedAt: new Date().toISOString(),
  }
  saveAdhocTemplate(template)
  return { template, model: result.model }
}

// ─── Suggest changes (AI reviews a manual checklist) ─────────────────────────

export interface SuggestedEdit {
  /** The original item id being edited. */
  itemId: string
  label?: string
  detail?: string
  category?: string
  estimatedMinutes?: number
  /** Why this edit was suggested (shown to user). */
  rationale?: string
}

export interface SuggestedAddition {
  label: string
  detail?: string
  category?: string
  estimatedMinutes?: number
  rationale?: string
}

export interface SuggestedRemoval {
  itemId: string
  rationale?: string
}

export interface ChecklistSuggestions {
  additions: SuggestedAddition[]
  edits: SuggestedEdit[]
  removals: SuggestedRemoval[]
  model: string
}

function buildSuggestSystemPrompt(propertyType: PropertyType): string {
  return [
    `You are a property checklist reviewer for a ${propertyType}.`,
    `You receive a user-maintained checklist along with detailed property context (equipment, narrative, history).`,
    `Your job: suggest improvements — items to add, edit, or remove — based on what makes sense for this specific property.`,
    ``,
    `Rules:`,
    `- Respect the user's list. Only suggest changes that materially improve coverage, accuracy, or specificity.`,
    `- Additions should fill real gaps (missing systems, seasonal concerns, property-specific risks).`,
    `- Edits should sharpen vague items (add brand/model/location, tighten wording, correct errors).`,
    `- Removals only for items that are clearly inapplicable to this property or already redundant.`,
    `- Keep suggestion volume reasonable: 0-5 of each type is typical. Return empty arrays if nothing warrants change.`,
    `- Each suggestion includes a short "rationale" explaining why — 1 sentence, plain language.`,
    `- Respond with JSON ONLY, no prose, no markdown fences. Schema:`,
    `  {`,
    `    "additions": [ { "label": string, "detail": string, "category": string, "estimatedMinutes": number, "rationale": string } ],`,
    `    "edits":     [ { "itemId": string, "label": string, "detail": string, "category": string, "estimatedMinutes": number, "rationale": string } ],`,
    `    "removals":  [ { "itemId": string, "rationale": string } ]`,
    `  }`,
    `- Edits and removals MUST use the exact itemId shown in the checklist.`,
    `- Edit fields are all optional; omit any you don't want to change.`,
  ].join('\n')
}

function buildSuggestUserPrompt(
  template: ChecklistTemplate,
  propertyContext: string,
): string {
  const itemsList = template.items.map(i =>
    `- id=${i.id} | [${i.category}] ${i.label}${i.detail ? ` — ${i.detail}` : ''}`,
  ).join('\n')
  return [
    `CHECKLIST NAME: ${template.name}`,
    `DESCRIPTION: ${template.description ?? '(none)'}`,
    ``,
    `CURRENT ITEMS:`,
    itemsList || '(empty)',
    ``,
    `─── PROPERTY CONTEXT ───`,
    propertyContext,
    ``,
    `Return JSON only.`,
  ].join('\n')
}

export async function suggestChecklistChanges(
  templateId: string,
  driveToken?: string | null,
): Promise<ChecklistSuggestions> {
  const template = findTemplate(templateId)
  if (!template || template.kind !== 'adhoc' || !template.propertyId) {
    throw new ChecklistGenerationError(`Not an adhoc template: ${templateId}`)
  }
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new ChecklistGenerationError('OpenRouter API key not configured')

  const propertyType: PropertyType = template.items[0]?.applicableTo[0] ?? 'residence'
  const propertyContext = await buildPropertyContext(template.propertyId, driveToken)
  const model = getModelForTask('checklistGen', DEFAULT_MODEL)

  const result = await chatCompletion({
    apiKey,
    model,
    temperature: 0.3,
    maxTokens: 8192,
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: 'ChecklistSuggestions', strict: true, schema: SUGGESTIONS_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: buildSuggestSystemPrompt(propertyType) },
      { role: 'user',   content: buildSuggestUserPrompt(template, propertyContext) },
    ],
  })

  let parsed: { additions?: unknown; edits?: unknown; removals?: unknown }
  try {
    parsed = JSON.parse(extractJson(result.content))
  } catch (e) {
    console.error('[checklistGenerator] Raw suggest output:', result.content)
    const head = result.content.slice(0, 160)
    const tail = result.content.length > 320 ? result.content.slice(-160) : ''
    throw new ChecklistGenerationError(
      `Model did not return valid JSON (length ${result.content.length}). Start: ${head}${tail ? ` … End: ${tail}` : ''}`,
      e,
    )
  }

  const additions = Array.isArray(parsed.additions) ? parsed.additions : []
  const edits = Array.isArray(parsed.edits) ? parsed.edits : []
  const removals = Array.isArray(parsed.removals) ? parsed.removals : []

  // Validate that edit/removal itemIds exist in the current template
  const knownIds = new Set(template.items.map(i => i.id))
  const strField = (o: unknown, k: string): string | undefined => {
    if (typeof o !== 'object' || o === null) return undefined
    const v = (o as Record<string, unknown>)[k]
    return typeof v === 'string' ? v : undefined
  }
  const numField = (o: unknown, k: string): number | undefined => {
    if (typeof o !== 'object' || o === null) return undefined
    const v = (o as Record<string, unknown>)[k]
    return typeof v === 'number' ? Math.round(v) : undefined
  }

  return {
    additions: additions
      .map(a => ({
        label: strField(a, 'label') ?? '',
        detail: strField(a, 'detail'),
        category: strField(a, 'category'),
        estimatedMinutes: numField(a, 'estimatedMinutes'),
        rationale: strField(a, 'rationale'),
      }))
      .filter(a => a.label.trim().length > 0),
    edits: edits
      .map(e => ({
        itemId: strField(e, 'itemId') ?? '',
        label: strField(e, 'label'),
        detail: strField(e, 'detail'),
        category: strField(e, 'category'),
        estimatedMinutes: numField(e, 'estimatedMinutes'),
        rationale: strField(e, 'rationale'),
      }))
      .filter(e => knownIds.has(e.itemId)),
    removals: removals
      .map(r => ({
        itemId: strField(r, 'itemId') ?? '',
        rationale: strField(r, 'rationale'),
      }))
      .filter(r => knownIds.has(r.itemId)),
    model: result.model,
  }
}

// ─── Apply accepted suggestions to a template ────────────────────────────────

export interface AcceptedSuggestions {
  additions: SuggestedAddition[]
  edits: SuggestedEdit[]
  removalIds: string[]
}

export function applySuggestions(
  templateId: string,
  accepted: AcceptedSuggestions,
): ChecklistTemplate | undefined {
  const template = findTemplate(templateId)
  if (!template || template.kind !== 'adhoc') return undefined
  const propertyType: PropertyType = template.items[0]?.applicableTo[0] ?? 'residence'

  const removed = new Set(accepted.removalIds)
  const editMap = new Map(accepted.edits.map(e => [e.itemId, e]))

  const kept: ChecklistItem[] = template.items
    .filter(i => !removed.has(i.id))
    .map(i => {
      const e = editMap.get(i.id)
      if (!e) return i
      return {
        ...i,
        label: e.label ?? i.label,
        detail: e.detail ?? i.detail,
        category: e.category ?? i.category,
        estimatedMinutes: e.estimatedMinutes ?? i.estimatedMinutes,
        source: 'manual' as const,
      }
    })

  const now = Date.now()
  const added: ChecklistItem[] = accepted.additions.map((a, idx) => ({
    id: `ai_suggest_${templateId}_${now}_${idx}`,
    label: a.label,
    detail: a.detail,
    category: a.category ?? 'Property-Specific',
    applicableTo: [propertyType],
    estimatedMinutes: a.estimatedMinutes,
    source: 'manual',
  }))

  const updated: ChecklistTemplate = {
    ...template,
    origin: 'manual',
    items: [...kept, ...added],
    updatedAt: new Date().toISOString(),
  }
  saveAdhocTemplate(updated)
  return updated
}
