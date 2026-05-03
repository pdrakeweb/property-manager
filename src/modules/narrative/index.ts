/**
 * `narrative` module — owner-authored property narrative.
 *
 * Surfaces inside `PropertyProfileScreen` (no standalone screen yet) and
 * feeds the AI advisor + Home Book exports with rich free-form context
 * about each property. Phase 2 declares the module so the Home Book and
 * Advisor modules can name it as a `requires` dependency once they ship.
 *
 * The narrative store predates the module system; this declaration just
 * registers the record-type with the vault under a stable schema so
 * remote pulls validate.
 */

import { z } from 'zod'
import type { ModuleDefinition } from '../_registry'

const NarrativeEntryZ = z.object({
  id:         z.string(),
  propertyId: z.string(),
  questionId: z.string(),
  question:   z.string(),
  answer:     z.string(),
  updatedAt:  z.string(),
})

export const NarrativeModule: ModuleDefinition = {
  id:          'narrative',
  name:        'Narrative',
  description:
    "Owner-authored answers to a fixed set of questions about each property — what it's used for, who lives there, the heating/water setup, seasonal concerns, ongoing projects. Builds the long-form context that the AI advisor and Home Book exports lean on.",
  version:     '1.0.0',
  category:    'property',
  icon:        'BookOpen',
  capabilities: [
    'Property narrative',
    'Free-form notes',
    'AI-assisted summaries',
  ],

  // No standalone screen yet — narratives are authored inside the
  // PropertyProfileScreen. The module exists primarily to register the
  // record type and to be a `requires` target for HomeBook / Advisor.
  routes:    [],
  navItems:  [],

  recordTypes: [
    { typeName: 'narrative_entry', schema: NarrativeEntryZ, syncable: true },
  ],
}

export default NarrativeModule
