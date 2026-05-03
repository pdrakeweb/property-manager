/**
 * Stable per-device identity, used as the actor id on CRDT vector clocks.
 *
 * The id is generated on first launch and persisted in `localStorage` under
 * `pm_device_id`. It is intentionally NOT tied to the Google account — the
 * same account on a phone and a laptop must have two distinct device ids so
 * concurrent edits can be detected and merged.
 *
 * Used by `vault/core/vclock.ts` (pure CRDT primitives) and by
 * `lib/syncedStore.ts` / `lib/maintenanceStore.ts` (every local write
 * increments this device's counter).
 */

const STORAGE_KEY = 'pm_device_id'

/** RFC 4122 v4 UUID via Web Crypto. Falls back to a Math.random shim only
 *  when crypto is unavailable (very old test envs); the shim collides at the
 *  birthday-paradox rate of ~1-in-71M for two devices, which is acceptable
 *  for a single-account dev fallback but should never run in prod. */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Non-cryptographic fallback for restricted environments. Mirrors v4 layout.
  const hex = (n: number) => n.toString(16).padStart(8, '0')
  return `${hex(Math.random() * 0xffffffff)}-${hex(Math.random() * 0xffff).slice(0, 4)}-4${
    hex(Math.random() * 0xfff).slice(0, 3)
  }-${(0x8 | (Math.random() * 0x4)).toString(16)}${hex(Math.random() * 0xfff).slice(0, 3)}-${
    hex(Math.random() * 0xffffffff)
  }${hex(Math.random() * 0xffff).slice(0, 4)}`
}

let cached: string | null = null

/**
 * Return the stable device id for this browser, generating + persisting one
 * on first call. Idempotent within a session via in-memory cache.
 */
export function getDeviceId(): string {
  if (cached) return cached
  if (typeof localStorage === 'undefined') {
    // Should never happen in the browser. Return a stable per-process id so
    // tests that import this module accidentally don't blow up.
    cached = generateUuid()
    return cached
  }
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) {
    cached = existing
    return existing
  }
  const fresh = generateUuid()
  localStorage.setItem(STORAGE_KEY, fresh)
  cached = fresh
  return fresh
}

/** Test/diagnostic hook — clears the in-memory cache (does NOT touch storage). */
export function _resetDeviceIdCache(): void {
  cached = null
}
