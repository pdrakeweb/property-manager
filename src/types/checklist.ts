export type Season = 'spring' | 'summer' | 'fall' | 'winter'
export type PropertyType = 'residence' | 'camp' | 'land'

export interface ChecklistItem {
  id: string
  label: string
  detail?: string           // Expandable hint text
  category: string          // e.g. 'HVAC', 'Plumbing', 'Exterior'
  applicableTo: PropertyType[]
  estimatedMinutes?: number
}

export interface ChecklistTemplate {
  id: string
  season: Season
  name: string
  items: ChecklistItem[]
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
  season: Season
  year: number
  startedAt: string         // ISO timestamp
  completedAt?: string
  items: ChecklistRunItem[]
}
