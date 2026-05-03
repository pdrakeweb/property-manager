/**
 * `ai` module — OpenRouter-backed advisory + AI inspection + risk brief.
 *
 * Phase 1 contract: this module is REGISTERED but its routes/nav are not yet
 * driven from the registry — the static blocks in `App.tsx` and
 * `AppShell.tsx` continue to render these screens. When Phase 2 flips the
 * shell to derive routes/nav from `getActivationOrder(activeIds)`, the
 * surface declared here becomes live.
 *
 * No `ai_conversation` / `inspection` / `risk_brief` record types exist in
 * `src/records/` yet, so `recordTypes` is intentionally omitted here. The
 * module owns those types when they're added.
 */

import { lazy } from 'react'
import { MessageSquare, ShieldAlert } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { getOpenRouterKey } from '@/store/settings'

const AIAdvisoryScreen = lazy(() =>
  import('@/screens/AIAdvisoryScreen').then(m => ({ default: m.AIAdvisoryScreen })),
)
const InspectionScreen = lazy(() =>
  import('@/screens/InspectionScreen').then(m => ({ default: m.InspectionScreen })),
)
const RiskBriefScreen = lazy(() =>
  import('@/screens/RiskBriefScreen').then(m => ({ default: m.RiskBriefScreen })),
)

export const AIModule: ModuleDefinition = {
  id:          'ai',
  name:        'AI Advisor',
  description:
    'OpenRouter-backed property advisor: chat about systems, extract data from photos and documents, parse voice memos, score equipment condition, and surface predictive risks.',
  version:     '1.0.0',
  category:    'ai',
  icon:        '🤖',
  capabilities: [
    'AI property advisor',
    'Document extraction',
    'Voice memo parsing',
    'Condition assessment',
    'Predictive risk analysis',
  ],

  routes: [
    { path: '/advisor',           element: <AIAdvisoryScreen /> },
    { path: '/equipment/:id/inspect', element: <InspectionScreen /> },
    { path: '/risk-brief',            element: <RiskBriefScreen /> },
  ],

  navItems: [
    { label: 'AI Advisor', path: '/advisor', icon: MessageSquare, group: 'tools' },
    { label: 'Risk Brief', path: '/risk-brief',  icon: ShieldAlert,   group: 'tools' },
  ],

  onActivate: () => {
    if (!getOpenRouterKey()) {
      // eslint-disable-next-line no-console
      console.warn('[ai module] OpenRouter API key is not configured — AI features will be unavailable until the key is set in Settings.')
    }
  },
}

export default AIModule
