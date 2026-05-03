/**
 * Vitest setup.
 *
 * Pulls in jest-dom matchers for any DOM-shaped assertions module
 * tests want to make. Otherwise intentionally minimal — module
 * registry tests run against the real registry and the real lib code,
 * not mocks.
 *
 * Historical note: an earlier version of this file mocked
 * `@/lib/propertyStore`, `@/lib/inboxPoller`, and `@/lib/expiryStore`
 * to work around a syncedStore↔propertyStore circular import that
 * Vite's SSR pipeline tripped on. The cycle was broken by extracting
 * `getPropertyDriveRoot` to `src/lib/propertyDriveRoot.ts`; the mocks
 * are no longer needed.
 */

import '@testing-library/jest-dom/vitest'
