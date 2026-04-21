export type Season = 'spring' | 'summer' | 'fall' | 'winter'
export type PropertyType = 'residence' | 'camp' | 'land'
export type ChecklistKind = 'seasonal' | 'adhoc'
export type ChecklistOrigin = 'ai' | 'manual'

export type ChecklistItemSource = 'baseline' | 'ai' | 'user'

export interface ChecklistItem {
  id: string
  label: string
  detail?: string           // Expandable hint text
  category: string          // e.g. 'HVAC', 'Plumbing', 'Exterior'
  applicableTo: PropertyType[]
  estimatedMinutes?: number
  /** Where this item originated. Baseline items come from the static template. */
  source?: ChecklistItemSource
}

/**
 * Per-property, per-template set of AI-generated or user-added items
 * layered on top of the baseline template.
 */
export interface ChecklistCustomSet {
  /** `${propertyId}_${templateId}` */
  id: string
  propertyId: string
  templateId: string
  items: ChecklistItem[]
  /** Hash of the property context used to generate. Detects drift. */
  generatedFrom?: string
  generatedAt?: string      // ISO timestamp
  model?: string
}

export interface ChecklistTemplate {
  id: string
  /** 'seasonal' templates ship in app; 'adhoc' are user-created per property. */
  kind?: ChecklistKind
  /**
   * For adhoc templates:
   *  - 'ai'     → items came from AI, shows Regenerate button
   *  - 'manual' → user-created OR AI-then-edited; shows Suggest-changes button
   * Seasonal templates don't use this field.
   */
  origin?: ChecklistOrigin
  /** Only set for seasonal templates. */
  season?: Season
  name: string
  /** Free-text description used by AI to tailor items (mainly for adhoc). */
  description?: string
  items: ChecklistItem[]
  /** Only set for adhoc templates: the property this was created for. */
  propertyId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChecklistRunItem {
  itemId: string
  done: boolean
  skipped: boolean
  note?: string
  completedAt?: string      // ISO timestamp
}

export interface ChecklistRun {
  id: string
  propertyId: string
  templateId: string
  kind?: ChecklistKind
  /** Only for seasonal runs. */
  season?: Season
  /** Snapshot of the template name for adhoc/renamed templates. */
  name?: string
  year: number
  startedAt: string         // ISO timestamp
  completedAt?: string
  items: ChecklistRunItem[]
}
