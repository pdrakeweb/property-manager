/**
 * Property narrative store — Q&A entries that build a story about each property.
 * Used to provide rich context to the AI advisor.
 */

import { makeStore } from './localStore'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface NarrativeEntry {
  id: string
  propertyId: string
  questionId: string
  question: string
  answer: string
  updatedAt: string
}

// ─── Predefined questions ───────────────────────────────────────────────────────

export const NARRATIVE_QUESTIONS = [
  {
    id: 'purpose',
    question: 'What is this property used for?',
    placeholder: 'e.g. Primary residence, vacation cabin, rental property, hunting camp, family farm...',
  },
  {
    id: 'occupants',
    question: 'Who lives or stays here, and how often?',
    placeholder: 'e.g. Family of 4 full-time, weekend getaway for 2, seasonal use May–October...',
  },
  {
    id: 'land',
    question: 'Describe the land and lot.',
    placeholder: 'e.g. 5 acres, wooded, gravel driveway, private well, septic, creek on south boundary...',
  },
  {
    id: 'heating_cooling',
    question: "What's the heating and cooling situation?",
    placeholder: 'e.g. Propane furnace + central AC, wood stove backup, no AC at camp...',
  },
  {
    id: 'water_sewer',
    question: 'Describe the water and sewer systems.',
    placeholder: 'e.g. Private well 180ft deep, water softener + iron filter, conventional septic 1000gal...',
  },
  {
    id: 'seasonal',
    question: 'What are the main seasonal concerns?',
    placeholder: 'e.g. Winterizing pipes at camp, spring flooding in low field, fall leaf cleanup on roof...',
  },
  {
    id: 'issues',
    question: 'Any known issues or ongoing projects?',
    placeholder: 'e.g. Basement gets damp in spring, planning to replace roof in 2027, old wiring in barn...',
  },
  {
    id: 'priorities',
    question: 'What are your priorities for this property?',
    placeholder: 'e.g. Keep maintenance costs low, improve energy efficiency, increase resale value, comfort...',
  },
  {
    id: 'unique',
    question: 'Any unique features or challenges?',
    placeholder: 'e.g. CAUV tax enrollment, shared driveway easement, historic barn, generator required for well...',
  },
  {
    id: 'history',
    question: 'Brief history of the property.',
    placeholder: 'e.g. Built 1978, purchased 2015, major renovation 2020 (kitchen, bathrooms, roof)...',
  },
]

// ─── Store ──────────────────────────────────────────────────────────────────────

export const narrativeStore = makeStore<NarrativeEntry>('pm_narratives')

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Get all narrative entries for a property */
export function getNarrativeForProperty(propertyId: string): NarrativeEntry[] {
  return narrativeStore.getAll().filter(e => e.propertyId === propertyId)
}

/** Get a single entry by property + question ID */
export function getNarrativeEntry(propertyId: string, questionId: string): NarrativeEntry | undefined {
  return narrativeStore.getAll().find(e => e.propertyId === propertyId && e.questionId === questionId)
}

/** Save or update a narrative entry */
export function saveNarrativeEntry(propertyId: string, questionId: string, question: string, answer: string): void {
  const existing = getNarrativeEntry(propertyId, questionId)
  if (existing) {
    narrativeStore.update({ ...existing, answer, updatedAt: new Date().toISOString() })
  } else {
    narrativeStore.add({
      id: `nar-${propertyId}-${questionId}`,
      propertyId,
      questionId,
      question,
      answer,
      updatedAt: new Date().toISOString(),
    })
  }
}

/** Build a formatted narrative text from all answered questions */
export function getNarrativeText(propertyId: string): string {
  const entries = getNarrativeForProperty(propertyId).filter(e => e.answer.trim())
  if (entries.length === 0) return ''

  const lines: string[] = ['PROPERTY NARRATIVE (owner-provided context):']
  for (const entry of entries) {
    lines.push(`Q: ${entry.question}`)
    lines.push(`A: ${entry.answer}`)
    lines.push('')
  }
  return lines.join('\n')
}
