export interface GeneratorRuntimeEntry {
  id: string
  date: string            // YYYY-MM-DD
  hours: number
  reason?: string         // "Ice storm 2026-01-17", "Annual load test"
  source: 'manual' | 'service-reset'
}

export interface GeneratorRecord {
  id: string
  propertyId: string
  name: string            // e.g. "Generac 22kW"
  model?: string
  installedYear?: number
  lastServiceHours: number  // cumulative hours at last oil change
  cumulativeHours: number   // computed: sum of all entries
  notes?: string
  entries: GeneratorRuntimeEntry[]
}

export interface GeneratorMilestone {
  label: string
  intervalHours: number
}

export const GENERATOR_MILESTONES: GeneratorMilestone[] = [
  { label: 'Oil Change',          intervalHours: 100 },
  { label: 'Spark Plugs',         intervalHours: 200 },
  { label: 'Air Filter',          intervalHours: 200 },
  { label: 'Full Annual Service', intervalHours: 500 },
]
