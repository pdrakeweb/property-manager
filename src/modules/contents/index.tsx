/**
 * `contents` module — household contents inventory for insurance.
 *
 * Tracks owned items room-by-room with photos, receipts, and AI-assisted
 * market value estimates; exports a CSV for insurance claims.
 *
 * Phase 2 contract: declared but not yet rendered. The legacy static
 * route in App.tsx still drives `/contents` until the active-modules
 * pipeline takes over the route table.
 */

import { lazy } from 'react'
import { Package } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'
import { ContentItemZ } from '@/records/contentItem'

const ContentsScreen = lazy(() =>
  import('@/screens/ContentsScreen').then(m => ({ default: m.ContentsScreen })),
)

export const ContentsModule: ModuleDefinition = {
  id:          'contents',
  name:        'Contents',
  description:
    'Home contents inventory with AI-assisted market values, receipt tracking, and an insurance-ready CSV export.',
  version:     '1.0.0',
  requires:    ['ai'],
  category:    'property',
  icon:        '📦',
  capabilities: [
    'Home contents inventory',
    'AI market value estimates',
    'Insurance CSV export',
    'Receipt tracking',
    'Photo documentation',
  ],

  routes: [
    { path: '/contents', element: <ContentsScreen /> },
  ],

  navItems: [
    { label: 'Contents', path: '/contents', icon: Package, group: 'property' },
  ],

  recordTypes: [
    { typeName: 'content_item', schema: ContentItemZ, syncable: true },
  ],
}

export default ContentsModule
