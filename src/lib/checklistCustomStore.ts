import { makeStore } from './localStore'
import type { ChecklistCustomSet, ChecklistItem } from '../types/checklist'

const store = makeStore<ChecklistCustomSet>('pm_checklist_custom')

function setId(propertyId: string, templateId: string): string {
  return `${propertyId}_${templateId}`
}

export function getCustomSet(
  propertyId: string,
  templateId: string,
): ChecklistCustomSet | undefined {
  return store.getById(setId(propertyId, templateId))
}

export function getCustomItems(
  propertyId: string,
  templateId: string,
): ChecklistItem[] {
  return getCustomSet(propertyId, templateId)?.items ?? []
}

export function saveCustomSet(set: ChecklistCustomSet): void {
  store.upsert(set)
}

export function clearCustomSet(propertyId: string, templateId: string): void {
  store.remove(setId(propertyId, templateId))
}

export const checklistCustomStore = {
  ...store,
  setId,
}
