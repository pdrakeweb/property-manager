/**
 * `risk` module — predictive failure + cost forecasting layer.
 *
 * Depends on `ai` (the OpenRouter client and prompt scaffolding live there).
 * The `/risk-brief` route + nav entry are owned by the `ai` module to keep
 * a single home for that page; this module exists separately so the
 * underlying risk-engine capabilities can be toggled / billed independently
 * of the conversational advisor.
 *
 * Phase 1 contract: registered but not yet rendered.
 */

import type { ModuleDefinition } from '../_registry'

export const RiskModule: ModuleDefinition = {
  id:          'risk',
  name:        'Risk Engine',
  description:
    'Predictive failure modelling and cost forecasting layered on top of the AI advisor. Scores risk severity per system and offers add-to-plan actions.',
  version:     '1.0.0',
  requires:    ['ai'],
  category:    'ai',
  icon:        '⚠️',
  capabilities: [
    'Predictive failure engine',
    'Cost estimates',
    'Risk severity scoring',
    'Add-to-plan actions',
  ],
  // Route + nav for /risk-brief are contributed by the `ai` module so we
  // don't intentionally double-register them here.
}

export default RiskModule
