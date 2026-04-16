/**
 * Home Assistant REST API client.
 *
 * All calls go directly to the user's local HA instance (CORS must allow the app origin,
 * or the user must access the app from the same host as HA).
 *
 * Settings are stored via settings.ts (haUrl / haToken).
 */

import { getSetting, SETTINGS } from '../store/settings'
import type { HAEntityState } from '../types'

export function getHAConfig() {
  return {
    url:   getSetting(SETTINGS.haUrl).replace(/\/$/, ''),
    token: getSetting(SETTINGS.haToken),
  }
}

/** Fetch the current state of a single entity. Returns null if not configured or on error. */
export async function fetchEntityState(entityId: string): Promise<HAEntityState | null> {
  const { url, token } = getHAConfig()
  if (!url || !token) return null

  try {
    const res = await fetch(`${url}/api/states/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as HAEntityState
  } catch {
    return null
  }
}

/**
 * List all entity states from HA.
 * Pass `domain` (e.g. 'sensor', 'switch', 'binary_sensor', 'climate') to filter by prefix.
 */
export async function listEntities(domain?: string): Promise<HAEntityState[]> {
  const { url, token } = getHAConfig()
  if (!url || !token) return []

  try {
    const res = await fetch(`${url}/api/states`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const all = (await res.json()) as HAEntityState[]
    return domain ? all.filter(e => e.entity_id.startsWith(`${domain}.`)) : all
  } catch {
    return []
  }
}

/** Returns true if HA is reachable with the stored config. */
export async function testHAConnection(): Promise<{ ok: boolean; error?: string }> {
  const { url, token } = getHAConfig()
  if (!url || !token) return { ok: false, error: 'URL and token required' }

  try {
    const res = await fetch(`${url}/api/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
