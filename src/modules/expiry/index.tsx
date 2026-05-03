/**
 * `expiry` module — document expiry tracker.
 *
 * Aggregates upcoming insurance / permit / warranty / contract expiry
 * dates onto a single dashboard so nothing falls through the cracks. The
 * module already has a screen (`ExpiryManageScreen`) and a dashboard
 * widget (`ExpiryWidget`) — Phase 2 just registers it with the module
 * system so users can disable it if they don't want the badge.
 */

import { lazy } from 'react'
import { z } from 'zod'
import { FileClock } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { propertyStore } from '@/lib/propertyStore'
import { getUpcomingExpiries } from '@/lib/expiryStore'

const ExpiryManageScreen = lazy(() =>
  import('@/screens/ExpiryManageScreen').then(m => ({ default: m.ExpiryManageScreen })),
)

const DocExpiryZ = z.object({
  id:          z.string(),
  driveFileId: z.string(),
  filename:    z.string(),
  propertyId:  z.string(),
  categoryId:  z.string().optional(),
  expiryDate:  z.string(),
  expiryType:  z.enum(['warranty', 'insurance', 'permit', 'contract', 'other']),
  notes:       z.string().optional(),
})

/** Badge: count of items expiring within the next 90 days, summed across
 *  every property the user has. The hook runs on every shell re-render so
 *  it keeps zero local state and just reads from the store. */
function useExpiryBadge(): number | undefined {
  // Cheap: store reads are synchronous localStorage parses. If perf
  // becomes an issue, swap in a memo keyed on a syncBus version.
  let total = 0
  for (const p of propertyStore.getAll()) {
    total += getUpcomingExpiries(p.id, 90).length
  }
  return total > 0 ? total : undefined
}

export const ExpiryModule: ModuleDefinition = {
  id:          'expiry',
  name:        'Expiry Tracker',
  description:
    'Single dashboard for everything with an end date — insurance policies, permits, warranties, contracts. The badge counts items expiring within 90 days so renewals are visible from anywhere in the app.',
  version:     '1.0.0',
  category:    'tools',
  icon:        'FileClock',
  capabilities: [
    'Insurance expiry alerts',
    'Permit expiry alerts',
    'Warranty tracking',
  ],

  routes: [
    { path: '/expiry', element: <ExpiryManageScreen /> },
  ],

  navItems: [
    {
      label:    'Expiry Tracker',
      path:     '/expiry',
      icon:     FileClock,
      group:    'tools',
      useBadge: useExpiryBadge,
    },
  ],

  recordTypes: [
    { typeName: 'doc_expiry', schema: DocExpiryZ, syncable: true },
  ],
}

export default ExpiryModule
