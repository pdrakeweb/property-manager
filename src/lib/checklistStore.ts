import { makeStore } from './localStore'
import type { ChecklistRun, ChecklistRunItem, PropertyType } from '../types/checklist'
import { CHECKLIST_TEMPLATES } from '../data/checklistTemplates'

export const checklistRunStore = makeStore<ChecklistRun>('pm_checklist_runs')

/** All runs for a specific property, sorted newest first. */
export function getRunsForProperty(propertyId: string): ChecklistRun[] {
  return checklistRunStore
    .getAll()
    .filter(r => r.propertyId === propertyId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** All completed runs across all properties, sorted newest first. */
export function getAllCompletedRuns(): ChecklistRun[] {
  return checklistRunStore
    .getAll()
    .filter(r => r.completedAt != null)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
}

/**
 * Most recent run for this property+template that has no completedAt.
 * Returns undefined if no active run exists.
 */
export function getActiveRun(
  propertyId: string,
  templateId: string,
): ChecklistRun | undefined {
  return checklistRunStore
    .getAll()
    .filter(
      r =>
        r.propertyId === propertyId &&
        r.templateId === templateId &&
        r.completedAt == null,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/**
 * Most recent completed run for this property+template.
 * Returns undefined if no completed run exists.
 */
export function getLastCompletedRun(
  propertyId: string,
  templateId: string,
): ChecklistRun | undefined {
  return checklistRunStore
    .getAll()
    .filter(
      r =>
        r.propertyId === propertyId &&
        r.templateId === templateId &&
        r.completedAt != null,
    )
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]
}

/**
 * Creates a new run. Filters items by applicableTo includes propertyType.
 * Sets year to current year, startedAt to now.
 * Each item becomes a ChecklistRunItem { itemId, done: false, skipped: false }.
 */
export function startRun(
  propertyId: string,
  templateId: string,
  propertyType: PropertyType,
): ChecklistRun {
  const template = CHECKLIST_TEMPLATES.find(t => t.id === templateId)
  if (!template) throw new Error(`Unknown checklist template: ${templateId}`)

  const filteredItems = template.items.filter(item =>
    item.applicableTo.includes(propertyType),
  )

  const run: ChecklistRun = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    propertyId,
    templateId,
    season: template.season,
    year: new Date().getFullYear(),
    startedAt: new Date().toISOString(),
    items: filteredItems.map(
      (item): ChecklistRunItem => ({
        itemId: item.id,
        done: false,
        skipped: false,
      }),
    ),
  }

  checklistRunStore.add(run)
  return run
}

/**
 * Finds the run, updates the matching item, saves.
 */
export function updateRunItem(
  runId: string,
  itemId: string,
  patch: Partial<ChecklistRunItem>,
): void {
  const run = checklistRunStore.getById(runId)
  if (!run) return

  const updated: ChecklistRun = {
    ...run,
    items: run.items.map(item =>
      item.itemId === itemId ? { ...item, ...patch } : item,
    ),
  }

  checklistRunStore.update(updated)
}

/**
 * Sets completedAt to now.
 */
export function completeRun(runId: string): void {
  const run = checklistRunStore.getById(runId)
  if (!run) return

  checklistRunStore.update({
    ...run,
    completedAt: new Date().toISOString(),
  })
}
