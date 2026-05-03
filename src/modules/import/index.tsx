/**
 * `import` module — Drive inbox poller + AI-assisted external imports.
 *
 * Pulls unread items from the property's Drive inbox folder, runs them
 * through the AI extractor (hence the `requires: ['ai']`), and surfaces
 * candidates for the user to approve/dismiss in the Import screen.
 *
 * Nav badge is the total queued count across every property, read directly
 * from `pm_import_queue_<propertyId>` localStorage entries so the badge
 * stays in sync without depending on the propertyStore at hook-call time.
 *
 * Phase 1 contract: registered but not yet rendered.
 */

import { lazy, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { ModuleDefinition } from '../_registry'

const ImportScreen = lazy(() =>
  import('@/screens/ImportScreen').then(m => ({ default: m.ImportScreen })),
)

const QUEUE_KEY_PREFIX            = 'pm_import_queue_'
const INBOX_QUEUE_CHANGED_EVENT   = 'pm-inbox-queue-changed'

function readTotalInboxQueueCount(): number {
  let total = 0
  if (typeof localStorage === 'undefined') return 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(QUEUE_KEY_PREFIX)) continue
    try {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) total += parsed.length
    } catch {
      // Malformed entry — ignore so the badge never throws on render.
    }
  }
  return total
}

function useInboxQueueBadge(): number | undefined {
  const [count, setCount] = useState<number>(() => readTotalInboxQueueCount())
  useEffect(() => {
    const refresh = () => setCount(readTotalInboxQueueCount())
    window.addEventListener(INBOX_QUEUE_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(INBOX_QUEUE_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return count > 0 ? count : undefined
}

export const ImportModule: ModuleDefinition = {
  id:          'import',
  name:        'Import',
  description:
    'Watches the property Drive inbox, runs new files through AI extraction, deduplicates against existing records, and queues candidates for approval.',
  version:     '1.0.0',
  requires:    ['ai'],
  category:    'tools',
  icon:        '📥',
  capabilities: [
    'Conversation import',
    'Drive inbox polling',
    'AI-assisted extraction',
    'Duplicate detection',
  ],

  routes: [
    { path: '/import', element: <ImportScreen /> },
  ],

  navItems: [
    { label: 'Import', path: '/import', icon: FileText, group: 'tools', useBadge: useInboxQueueBadge },
  ],
}

export default ImportModule
