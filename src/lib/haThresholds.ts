/**
 * Per-entity alert thresholds for Home Assistant numeric sensors.
 *
 * Stored in `localStorage` under `pm_ha_thresholds_<entityId>` so the data
 * shape per entity is independent and easy to delete. Read by `haAlerts.ts`
 * during alert evaluation; written by EquipmentDetailScreen's threshold UI.
 */

export interface HAThreshold {
  /** Optional lower bound — alert when state < min (inclusive comparison). */
  min?: number
  /** Optional upper bound — alert when state > max (inclusive comparison). */
  max?: number
  /** Human-readable label used in alert text (defaults to friendly_name). */
  label?: string
}

const KEY_PREFIX = 'pm_ha_thresholds_'

function key(entityId: string): string {
  return `${KEY_PREFIX}${entityId}`
}

/** Returns the threshold for an entity, or `null` if none configured. */
export function getThreshold(entityId: string): HAThreshold | null {
  try {
    const raw = localStorage.getItem(key(entityId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as HAThreshold
    if (parsed.min == null && parsed.max == null) return null
    return parsed
  } catch {
    return null
  }
}

/** Persist a threshold. Pass `null` for min/max to clear that bound only. */
export function setThreshold(entityId: string, threshold: HAThreshold): void {
  if (threshold.min == null && threshold.max == null) {
    clearThreshold(entityId)
    return
  }
  localStorage.setItem(key(entityId), JSON.stringify(threshold))
}

export function clearThreshold(entityId: string): void {
  localStorage.removeItem(key(entityId))
}

/** Enumerate all configured thresholds. Useful for haAlerts polling. */
export function getAllThresholds(): Array<{ entityId: string; threshold: HAThreshold }> {
  const out: Array<{ entityId: string; threshold: HAThreshold }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(KEY_PREFIX)) continue
    const entityId = k.slice(KEY_PREFIX.length)
    const t = getThreshold(entityId)
    if (t) out.push({ entityId, threshold: t })
  }
  return out
}

/**
 * Evaluate a numeric value against a threshold. Returns the violation kind
 * (`'below'` / `'above'`) or `null` if the value is within bounds or
 * non-numeric.
 */
export function checkThreshold(value: string, threshold: HAThreshold): 'below' | 'above' | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (threshold.min != null && n < threshold.min) return 'below'
  if (threshold.max != null && n > threshold.max) return 'above'
  return null
}
