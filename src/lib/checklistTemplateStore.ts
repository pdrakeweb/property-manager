import { makeStore } from './localStore'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'
import type { ChecklistItem, ChecklistTemplate, PropertyType } from '../types/checklist'

/**
 * User-created ad-hoc checklist templates. Per-property, not seasonal.
 * Seasonal templates live in CHECKLIST_TEMPLATES (static data).
 */
const store = makeStore<ChecklistTemplate>('pm_checklist_adhoc_templates')

export const adhocTemplateStore = store

export function getAdhocTemplates(propertyId: string): ChecklistTemplate[] {
  return store.getAll()
    .filter(t => t.propertyId === propertyId)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export function saveAdhocTemplate(t: ChecklistTemplate): void {
  store.upsert(t)
}

export function deleteAdhocTemplate(id: string): void {
  store.remove(id)
}

/**
 * Look up a template by id across baseline seasonal templates and user adhoc templates.
 */
export function findTemplate(templateId: string): ChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find(t => t.id === templateId) ?? store.getById(templateId)
}

// ─── Item editing ────────────────────────────────────────────────────────────
// Any edit to an adhoc template's items flips its origin to 'manual'.
// That's how AI-generated checklists become manual once the user touches them.

function newItemId(templateId: string): string {
  return `manual_${templateId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function addItemToTemplate(
  templateId: string,
  partial: Partial<ChecklistItem> & { label: string },
  propertyType: PropertyType,
): ChecklistTemplate | undefined {
  const t = store.getById(templateId)
  if (!t) return undefined
  const item: ChecklistItem = {
    id: newItemId(templateId),
    label: partial.label,
    detail: partial.detail,
    category: partial.category ?? 'Property-Specific',
    applicableTo: partial.applicableTo ?? [propertyType],
    estimatedMinutes: partial.estimatedMinutes,
    source: 'manual',
  }
  const updated: ChecklistTemplate = {
    ...t,
    origin: 'manual',
    items: [...t.items, item],
    updatedAt: new Date().toISOString(),
  }
  store.upsert(updated)
  return updated
}

export function updateItemInTemplate(
  templateId: string,
  itemId: string,
  patch: Partial<ChecklistItem>,
): ChecklistTemplate | undefined {
  const t = store.getById(templateId)
  if (!t) return undefined
  const updated: ChecklistTemplate = {
    ...t,
    origin: 'manual',
    items: t.items.map(i =>
      i.id === itemId ? { ...i, ...patch, source: 'manual' as const } : i,
    ),
    updatedAt: new Date().toISOString(),
  }
  store.upsert(updated)
  return updated
}

export function removeItemFromTemplate(
  templateId: string,
  itemId: string,
): ChecklistTemplate | undefined {
  const t = store.getById(templateId)
  if (!t) return undefined
  const updated: ChecklistTemplate = {
    ...t,
    origin: 'manual',
    items: t.items.filter(i => i.id !== itemId),
    updatedAt: new Date().toISOString(),
  }
  store.upsert(updated)
  return updated
}

/**
 * Replace the full item list and mark origin. Used by "apply suggestions" flow
 * (caller decides the new origin — typically 'manual').
 */
export function replaceTemplateItems(
  templateId: string,
  items: ChecklistItem[],
  origin: ChecklistTemplate['origin'] = 'manual',
): ChecklistTemplate | undefined {
  const t = store.getById(templateId)
  if (!t) return undefined
  const updated: ChecklistTemplate = {
    ...t,
    origin,
    items,
    updatedAt: new Date().toISOString(),
  }
  store.upsert(updated)
  return updated
}

// ─── Manual template creation ────────────────────────────────────────────────

export interface CreateManualOptions {
  propertyId: string
  propertyType: PropertyType
  name: string
  description?: string
  /** Raw text, one item per line. Empty lines skipped. */
  itemsText: string
}

/**
 * Parse a newline-separated string into manual checklist items.
 * Supports an optional "Category: label" prefix.
 */
export function parseManualItems(
  text: string,
  templateId: string,
  propertyType: PropertyType,
): ChecklistItem[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.map((line, idx) => {
    // "- " or "* " bullet prefixes
    const cleaned = line.replace(/^[-*•]\s+/, '').trim()
    // "Category: label" form
    const catMatch = cleaned.match(/^([A-Za-z][A-Za-z /&-]{0,30}):\s+(.+)$/)
    const category = catMatch ? catMatch[1].trim() : 'Property-Specific'
    const label = catMatch ? catMatch[2].trim() : cleaned
    return {
      id: `manual_${templateId}_${Date.now()}_${idx}`,
      label,
      category,
      applicableTo: [propertyType],
      source: 'manual' as const,
    }
  })
}

export function createManualChecklist(opts: CreateManualOptions): ChecklistTemplate {
  const { propertyId, propertyType, name, description, itemsText } = opts
  if (!name.trim()) throw new Error('Name is required')
  const templateId = `adhoc_${propertyId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const items = parseManualItems(itemsText, templateId, propertyType)
  const now = new Date().toISOString()
  const template: ChecklistTemplate = {
    id: templateId,
    kind: 'adhoc',
    origin: 'manual',
    name: name.trim(),
    description: description?.trim() || undefined,
    items,
    propertyId,
    createdAt: now,
    updatedAt: now,
  }
  store.upsert(template)
  return template
}
