/**
 * Local store for inspection records (Phase 3 §2 condition assessment).
 *
 * Kept deliberately separate from the DSL-registered records this round
 * — adding a new IndexRecordType + Zod schema + folder name + sync
 * wiring is its own batch. Inspections live in `pm_inspections` and
 * are read/written synchronously via this module. Drive sync is a
 * follow-up (would route through `makeSyncedStore` once registered).
 */

import { makeStore } from './localStore'

export type ConditionSeverity = 1 | 2 | 3 | 4 | 5

export interface InspectionPhoto {
  id:           string
  /** data: URL of the captured image. Cleared after Drive upload (future). */
  localDataUrl: string
  takenAt:      string
}

export type InspectionUrgency = 'immediate' | 'within-30-days' | 'within-6-months' | 'annual' | 'monitor'

export interface AiConditionAssessment {
  severity:          ConditionSeverity
  severityLabel:     string
  summary:           string
  findings:          string[]
  recommendedAction: string
  urgency:           InspectionUrgency
  confidenceNote?:   string
  modelUsed:         string
}

export interface Inspection {
  id:                       string
  propertyId:               string
  equipmentId:              string
  categoryId:               string
  inspectedAt:              string
  inspectedBy?:             string
  photos:                   InspectionPhoto[]
  voiceNoteTranscript?:     string
  aiAssessment?:            AiConditionAssessment
  userOverrideSeverity?:    ConditionSeverity
  linkedMaintenanceTaskId?: string
}

export const inspectionStore = makeStore<Inspection>('pm_inspections')

export function getInspectionsForEquipment(equipmentId: string): Inspection[] {
  return inspectionStore.getAll().filter(i => i.equipmentId === equipmentId)
}

export function getInspectionsForProperty(propertyId: string): Inspection[] {
  return inspectionStore.getAll().filter(i => i.propertyId === propertyId)
}

/** Latest first. */
export function sortByDateDesc(list: Inspection[]): Inspection[] {
  return [...list].sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt))
}

/** Effective severity: user override beats AI assessment. */
export function effectiveSeverity(i: Inspection): ConditionSeverity | undefined {
  return i.userOverrideSeverity ?? i.aiAssessment?.severity
}
