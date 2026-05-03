/**
 * Vitest setup: mocks for the module-test surface.
 *
 * The codebase has a syncedStore ↔ propertyStore circular import that
 * Vite's browser pipeline tolerates (modules complete top-level
 * evaluation before any function actually runs) but Vitest's SSR
 * pipeline trips on (`Cannot access '__vite_ssr_import_*' before
 * initialization`). Module-structure tests don't exercise propertyStore
 * behavior, so we mock the store and its inboxPoller dependency to
 * stable empty stubs.
 *
 * If a module test wants to verify real store behavior, override the
 * mock locally with `vi.unmock('@/lib/propertyStore')` + a fresh
 * factory; nothing here forces the empty-store shape on every test.
 */

import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('@/lib/propertyStore', () => ({
  propertyStore: {
    getAll:    () => [],
    getById:   () => null,
    add:       () => undefined,
    update:    () => undefined,
    upsert:    () => undefined,
    delete:    () => undefined,
  },
  useProperties:               () => [],
  seedPropertiesFromMock:      () => undefined,
}))

vi.mock('@/lib/inboxPoller', () => ({
  INBOX_QUEUE_CHANGED_EVENT: 'pm-inbox-queue-changed',
  getInboxQueue:             () => [],
  getInboxQueueCount:         () => 0,
  getTotalInboxQueueCount:    () => 0,
  removeFromInboxQueue:       () => undefined,
  resetInbox:                 () => undefined,
  pollInbox:                  async () => ({ pulled: 0, queued: 0, errors: [] }),
  pollAllInboxes:             async () => undefined,
}))

vi.mock('@/lib/expiryStore', () => ({
  getUpcomingExpiries: () => [],
  recordExpiry:        () => undefined,
  removeExpiry:        () => undefined,
}))
