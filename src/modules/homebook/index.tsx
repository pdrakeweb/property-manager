/**
 * `homebook` module — long-form property document.
 *
 * Composes data from every other module's stores into a printable Home
 * Book (HTML / PDF / Drive upload) with per-section visibility toggles.
 * Owns no record types of its own — it is a pure presentation layer.
 *
 * Phase 2 contract: declared but not yet rendered. The legacy static
 * route in App.tsx still drives `/home-book` until the active-modules
 * pipeline takes over the route table.
 */

import { lazy } from 'react'
import { Library } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'

const HomeBookScreen = lazy(() =>
  import('@/screens/HomeBookScreen').then(m => ({ default: m.HomeBookScreen })),
)

export const HomeBookModule: ModuleDefinition = {
  id:          'homebook',
  name:        'Home Book',
  description:
    'Composes a full property document from every active module — print to PDF, export HTML, or upload to Drive, with per-section visibility controls.',
  version:     '1.0.0',
  category:    'tools',
  icon:        '📖',
  capabilities: [
    'Full property document',
    'Print-to-PDF',
    'HTML export',
    'Drive upload',
    'Section visibility controls',
  ],

  routes: [
    { path: '/home-book', element: <HomeBookScreen /> },
  ],

  navItems: [
    { label: 'Home Book', path: '/home-book', icon: Library, group: 'tools' },
  ],
}

export default HomeBookModule
