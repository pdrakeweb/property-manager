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

export function isHAConfigured(): boolean {
  const { url, token } = getHAConfig()
  return !!url && !!token
}

/** Single point in an entity's history. Mirrors the shape HA returns. */
export interface HAHistoryPoint {
  state:        string
  last_changed: string
}

/**
 * Lightweight automation summary derived from `/api/states?domain=automation`.
 * (HA's `/api/config/automation/config` returns YAML config but no runtime
 * state — we use the states endpoint to get state + last_triggered together.)
 */
export interface HAAutomationInfo {
  entity_id:      string
  friendly_name:  string
  state:          string
  last_triggered: string | null
  mode?:          string
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

/**
 * Fetch state history for a single entity over the last `hours` hours.
 * Hits `/api/history/period?filter_entity_id=…` and returns a flat array of
 * `{state, last_changed}` points. Returns `[]` on any failure.
 */
export async function getEntityHistory(entityId: string, hours = 24): Promise<HAHistoryPoint[]> {
  const { url, token } = getHAConfig()
  if (!url || !token) return []

  const start = new Date(Date.now() - hours * 3_600_000).toISOString()
  try {
    const res = await fetch(
      `${url}/api/history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return []
    // HA returns [[ {state, last_changed, ...}, ... ]] — one inner array per
    // requested entity. Flatten the first (only) entry.
    const json = (await res.json()) as Array<Array<{ state: string; last_changed: string }>>
    const series = json[0] ?? []
    return series.map(p => ({ state: p.state, last_changed: p.last_changed }))
  } catch {
    return []
  }
}

/**
 * List automations as `{name, state, last_triggered, mode}` summaries.
 *
 * Implementation note: the prompt referenced `/api/config/automation/config`
 * (the YAML config endpoint) but that path returns *config* (alias, mode,
 * triggers) and does NOT include runtime state or last_triggered. The data
 * the UI actually wants — current state and last firing — lives on the
 * automation entities themselves. So we read `/api/states?domain=automation`
 * which carries both. Returns `[]` when HA is unreachable.
 */
export async function listAutomations(): Promise<HAAutomationInfo[]> {
  const states = await listEntities('automation')
  return states.map(s => ({
    entity_id:      s.entity_id,
    friendly_name:  String(s.attributes.friendly_name ?? s.entity_id.replace(/^automation\./, '')),
    state:          s.state,
    last_triggered: (s.attributes.last_triggered as string | null | undefined) ?? null,
    mode:           s.attributes.mode as string | undefined,
  }))
}
