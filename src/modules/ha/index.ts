/**
 * `ha` module — Home Assistant integration.
 *
 * HA has no dedicated screen of its own: live entity state and the alerts
 * banner render inside the Dashboard, threshold configuration lives on
 * EquipmentDetail, and the connection/token settings live on the Settings
 * screen — all of those screens belong to other modules. The `ha` module
 * therefore declares no routes or nav items; it owns the HA-specific
 * record types and wires the focus-polling lifecycle.
 *
 * Phase 1/2 contract: registered but not rendered. Future phases consume
 * `recordTypes` to register Zod schemas with the vault and `onActivate` /
 * `onDeactivate` to drive polling.
 */

import { z } from 'zod'
import type { ModuleDefinition } from '../_registry'
import { installFocusPolling, uninstallFocusPolling } from '@/lib/haAlerts'

// ─── Local schemas ─────────────────────────────────────────────────────────
//
// These mirror the TypeScript shapes in `lib/haThresholds.ts` and
// `lib/haAlerts.ts`. Both records are local-only caches (HA state +
// dismissals don't round-trip through Drive), so `syncable: false`.

const HAThresholdZ = z.object({
  entityId: z.string(),
  min:      z.number().optional(),
  max:      z.number().optional(),
  label:    z.string().optional(),
})

const HAAlertZ = z.object({
  id:         z.string(),
  entityId:   z.string(),
  label:      z.string(),
  severity:   z.enum(['critical', 'warning', 'info']),
  reason:     z.string(),
  value:      z.string(),
  detectedAt: z.string(),
})

export const HaModule: ModuleDefinition = {
  id:          'ha',
  name:        'Home Assistant',
  description:
    'Live entity state, problem-sensor monitoring, configurable thresholds, and 24-hour history sparklines from a Home Assistant instance. Surfaces alerts in the Dashboard banner and the nav rail.',
  version:     '1.0.0',
  category:    'systems',
  icon:        '🏡',
  capabilities: [
    'Live entity state',
    'Alert monitoring',
    'Threshold configuration',
    '24h sparklines',
    'Bulk entity import',
    'Automations list',
  ],

  // No routes or nav items: HA panels are embedded in screens owned by
  // the dashboard / equipment / settings modules.

  recordTypes: [
    { typeName: 'ha_threshold', schema: HAThresholdZ, syncable: false },
    { typeName: 'ha_alert',     schema: HAAlertZ,     syncable: false },
  ],

  onActivate(): void {
    // Idempotent — guarded inside installFocusPolling itself.
    installFocusPolling()
  },

  onDeactivate(): void {
    uninstallFocusPolling()
  },
}

export default HaModule
