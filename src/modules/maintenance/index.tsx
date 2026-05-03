/**
 * `maintenance` module — recurring tasks, completed-work history, and the
 * seasonal/adhoc checklist runner.
 *
 * Phase 2 contract: this declaration is REGISTERED but not yet rendered.
 * The existing static routes/nav in `App.tsx` and `AppShell.tsx` continue
 * to drive the UI. Once the activeIds-driven shell goes live, the four
 * routes and two nav items below become the source of truth.
 *
 * Owned record types:
 *  - `task`            — maintenance task (existing DSL schema in records/maintenanceTask.ts)
 *  - `completed_event` — service event (existing DSL schema in records/completedEvent.ts)
 *  - `checklist`       — template (Zod minted here from src/types/checklist.ts)
 *  - `checklist_item`  — single item within a checklist (Zod minted here)
 */

import { lazy } from 'react'
import { z } from 'zod'
import { Wrench, CheckSquare } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { MaintenanceTaskZ }     from '@/records/maintenanceTask'
import { CompletedEventZ }      from '@/records/completedEvent'

// Lazy-loaded screens — chunk boundaries match `App.tsx` so we share the
// same per-route bundles once these routes go live.
const MaintenanceScreen = lazy(() =>
  import('@/screens/MaintenanceScreen').then(m => ({ default: m.MaintenanceScreen })),
)
const ChecklistScreen = lazy(() =>
  import('@/screens/ChecklistScreen').then(m => ({ default: m.ChecklistScreen })),
)
const ChecklistRunScreen = lazy(() =>
  import('@/screens/ChecklistRunScreen').then(m => ({ default: m.ChecklistRunScreen })),
)
const ChecklistGuidedScreen = lazy(() =>
  import('@/screens/ChecklistGuidedScreen').then(m => ({ default: m.ChecklistGuidedScreen })),
)

// ── Checklist Zod schemas ───────────────────────────────────────────────────
//
// `src/types/checklist.ts` defines the runtime shape with plain TS interfaces;
// no Zod equivalent exists yet because the checklist subsystem predates the
// vault's typed-record pipeline. We mirror those interfaces here so the
// module's recordTypes contribution is well-formed without churning the
// existing checklist storage layer.

const ChecklistItemZ = z.object({
  id:               z.string(),
  label:            z.string(),
  detail:           z.string().optional(),
  category:         z.string(),
  applicableTo:     z.array(z.enum(['residence', 'camp', 'land'])),
  estimatedMinutes: z.number().optional(),
  source:           z.enum(['baseline', 'ai', 'user', 'manual']).optional(),
})

const ChecklistZ = z.object({
  id:          z.string(),
  kind:        z.enum(['seasonal', 'adhoc']).optional(),
  origin:      z.enum(['ai', 'manual']).optional(),
  season:      z.enum(['spring', 'summer', 'fall', 'winter']).optional(),
  name:        z.string(),
  description: z.string().optional(),
  propertyId:  z.string().optional(),
  items:       z.array(ChecklistItemZ),
  createdAt:   z.string().optional(),
  updatedAt:   z.string().optional(),
})

export const MaintenanceModule: ModuleDefinition = {
  id:           'maintenance',
  name:         'Maintenance',
  description:
    'Recurring task scheduling with due/overdue tracking, completed-work history with photo and cost evidence, and seasonal or adhoc guided checklists for routine property care.',
  version:      '1.0.0',
  category:     'property',
  icon:         '🔧',
  capabilities: [
    'Task scheduling',
    'Work order history',
    'Photo documentation',
    'Guided checklists',
    'Voice memo logging',
    'Completion reports',
  ],

  // Routes mirror the existing entries in `App.tsx`. Future phases will
  // assemble React-Router routes from `getActivationOrder(activeIds)
  // .flatMap(m => m.routes ?? [])` — at that point this list becomes the
  // source of truth and the static block in App.tsx goes away.
  routes: [
    { path: '/maintenance',                element: <MaintenanceScreen />     },
    { path: '/checklists',                 element: <ChecklistScreen />       },
    { path: '/checklists/:runId',          element: <ChecklistRunScreen />    },
    { path: '/checklists/:runId/guided',   element: <ChecklistGuidedScreen /> },
  ],

  navItems: [
    { label: 'Tasks',      path: '/maintenance', icon: Wrench,      group: 'property' },
    { label: 'Checklists', path: '/checklists',  icon: CheckSquare, group: 'property' },
  ],

  // Domain types this module owns. The DSL registry already manages `task`
  // and `completed_event` via `records/registry.ts`; declaring them here
  // marks ownership for the activeIds pipeline. Checklist types are minted
  // inline above because they have no DSL definition yet.
  recordTypes: [
    { typeName: 'task',            schema: MaintenanceTaskZ, syncable: true },
    { typeName: 'completed_event', schema: CompletedEventZ,  syncable: true },
    { typeName: 'checklist',       schema: ChecklistZ,       syncable: true },
    { typeName: 'checklist_item',  schema: ChecklistItemZ,   syncable: true },
  ],
}

export default MaintenanceModule
