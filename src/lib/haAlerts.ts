/**
 * Home Assistant alert detection + storage.
 *
 * Polls HA on app focus (window 'focus' event) and computes a list of
 * alerts based on:
 *   1. binary_sensor entities with a "problem-style" device_class set to 'on'
 *      (e.g. door, window, leak, smoke, motion, problem, gas)
 *   2. numeric sensors that violate a configured threshold
 *      (see haThresholds.ts)
 *
 * The result is persisted to `pm_ha_alerts` so subscribers (Dashboard
 * banner, nav badge) can render synchronously without re-polling. Cross-tab
 * updates flow through the `storage` event.
 *
 * Dismissed alerts are tracked separately in `pm_ha_alerts_dismissed` keyed
 * by alert id so they don't reappear until the underlying state changes.
 */

import { useEffect, useState } from 'react'
import { listEntities, fetchEntityState, isHAConfigured } from './haClient'
import { getAllThresholds, checkThreshold } from './haThresholds'
import type { HAEntityState } from '../types'

export type HAAlertSeverity = 'critical' | 'warning' | 'info'

export interface HAAlert {
  /** Stable id: `<entity_id>:<reason>` so re-evaluations don't duplicate. */
  id:        string
  entityId:  string
  label:     string
  severity:  HAAlertSeverity
  reason:    string
  value:     string
  detectedAt: string
}

const STORAGE_KEY   = 'pm_ha_alerts'
const DISMISSED_KEY = 'pm_ha_alerts_dismissed'

const PROBLEM_DEVICE_CLASSES = new Set([
  'door', 'window', 'leak', 'moisture', 'smoke', 'gas',
  'motion', 'problem', 'safety', 'tamper', 'co', 'co2',
])

const SEVERITY_BY_CLASS: Record<string, HAAlertSeverity> = {
  smoke: 'critical', gas: 'critical', co: 'critical', co2: 'critical',
  leak: 'critical', moisture: 'critical', safety: 'critical',
  problem: 'warning', tamper: 'warning',
  door: 'info', window: 'info', motion: 'info',
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

export function getAlerts(): HAAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HAAlert[]
  } catch {
    return []
  }
}

function setAlerts(alerts: HAAlert[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
  notifySubscribers()
}

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function setDismissed(ids: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

export function dismissAlert(id: string): void {
  const ids = getDismissed()
  ids.add(id)
  setDismissed(ids)
  notifySubscribers()
}

export function clearDismissals(): void {
  localStorage.removeItem(DISMISSED_KEY)
  notifySubscribers()
}

/** Active alerts = stored alerts minus those the user dismissed. */
export function getActiveAlerts(): HAAlert[] {
  const dismissed = getDismissed()
  return getAlerts().filter(a => !dismissed.has(a.id))
}

// ─── Alert evaluation ────────────────────────────────────────────────────────

function evalBinarySensor(e: HAEntityState): HAAlert | null {
  if (e.state !== 'on') return null
  const deviceClass = String(e.attributes.device_class ?? '')
  if (!PROBLEM_DEVICE_CLASSES.has(deviceClass)) return null
  const label = String(e.attributes.friendly_name ?? e.entity_id)
  return {
    id:         `${e.entity_id}:device_class:${deviceClass}`,
    entityId:   e.entity_id,
    label,
    severity:   SEVERITY_BY_CLASS[deviceClass] ?? 'warning',
    reason:     deviceClassReason(deviceClass),
    value:      'on',
    detectedAt: new Date().toISOString(),
  }
}

function deviceClassReason(cls: string): string {
  switch (cls) {
    case 'door':     return 'Door is open'
    case 'window':   return 'Window is open'
    case 'leak':
    case 'moisture': return 'Water leak detected'
    case 'smoke':    return 'Smoke detected'
    case 'gas':      return 'Gas detected'
    case 'co':       return 'CO detected'
    case 'co2':      return 'CO₂ detected'
    case 'motion':   return 'Motion detected'
    case 'safety':   return 'Safety alarm tripped'
    case 'tamper':   return 'Tamper detected'
    case 'problem':  return 'Problem reported'
    default:         return 'Alert'
  }
}

async function evalThresholds(): Promise<HAAlert[]> {
  const out: HAAlert[] = []
  const configured = getAllThresholds()
  if (configured.length === 0) return out

  // Fetch each in parallel — small N (one per linked equipment).
  const results = await Promise.all(configured.map(async ({ entityId, threshold }) => {
    const state = await fetchEntityState(entityId)
    if (!state) return null
    const violation = checkThreshold(state.state, threshold)
    if (!violation) return null
    const label = threshold.label || String(state.attributes.friendly_name ?? entityId)
    const unit  = (state.attributes.unit_of_measurement as string | undefined) ?? ''
    const bound = violation === 'below' ? threshold.min : threshold.max
    return {
      id:         `${entityId}:threshold:${violation}`,
      entityId,
      label,
      severity:   'warning' as const,
      reason:     violation === 'below'
        ? `Below ${bound}${unit ? ' ' + unit : ''}`
        : `Above ${bound}${unit ? ' ' + unit : ''}`,
      value:      unit ? `${state.state} ${unit}` : state.state,
      detectedAt: new Date().toISOString(),
    }
  }))

  for (const r of results) if (r) out.push(r)
  return out
}

/**
 * Recompute alerts from current HA state and persist them. Returns the
 * resulting (active) alert list. Safe to call when HA isn't configured —
 * it clears stored alerts and returns `[]`.
 */
export async function refreshAlerts(): Promise<HAAlert[]> {
  if (!isHAConfigured()) {
    setAlerts([])
    return []
  }

  const [binaryStates, thresholdAlerts] = await Promise.all([
    listEntities('binary_sensor'),
    evalThresholds(),
  ])

  const binaryAlerts: HAAlert[] = []
  for (const e of binaryStates) {
    const a = evalBinarySensor(e)
    if (a) binaryAlerts.push(a)
  }

  const all = [...binaryAlerts, ...thresholdAlerts]
  setAlerts(all)

  // Garbage-collect dismissals for alerts that no longer exist so the user
  // sees re-occurrences without manual reset.
  const liveIds = new Set(all.map(a => a.id))
  const dismissed = getDismissed()
  let mutated = false
  for (const id of [...dismissed]) {
    if (!liveIds.has(id)) { dismissed.delete(id); mutated = true }
  }
  if (mutated) setDismissed(dismissed)

  return getActiveAlerts()
}

// ─── Subscription bus (in-tab + cross-tab via storage event) ────────────────

type Subscriber = () => void
const subscribers = new Set<Subscriber>()

export function subscribeAlerts(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

function notifySubscribers(): void {
  for (const s of subscribers) {
    try { s() } catch { /* ignore subscriber errors */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY || e.key === DISMISSED_KEY) notifySubscribers()
  })
}

// ─── Focus-based polling installer ───────────────────────────────────────────

let installed = false
// Stable references so `uninstallFocusPolling` can remove the same listeners
// `installFocusPolling` added.
let focusTick:      (() => void) | null = null
let visibilityTick: (() => void) | null = null
let initialTimerId: ReturnType<typeof setTimeout> | null = null

/**
 * Wire up window focus + interval polling. Idempotent — call once at app
 * boot. When HA is unconfigured the polls cheap-fail and clear the alert
 * list, so it's safe to install unconditionally.
 */
export function installFocusPolling(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  focusTick = () => { void refreshAlerts() }
  visibilityTick = () => {
    if (document.visibilityState === 'visible' && focusTick) focusTick()
  }

  window.addEventListener('focus', focusTick)
  // Also fire on visibilitychange → visible (covers tab switches without
  // window focus events on some browsers).
  document.addEventListener('visibilitychange', visibilityTick)

  // Initial tick after boot — slight delay so we don't block first paint.
  initialTimerId = setTimeout(focusTick, 1500)
}

/**
 * Tear down the focus polling installed by `installFocusPolling`.
 * Removes window/document listeners, cancels the boot-time initial tick,
 * and resets the installed flag so a later `installFocusPolling()` call
 * re-installs cleanly. Safe to call when polling was never installed.
 */
export function uninstallFocusPolling(): void {
  if (!installed || typeof window === 'undefined') return
  if (focusTick)      window.removeEventListener('focus', focusTick)
  if (visibilityTick) document.removeEventListener('visibilitychange', visibilityTick)
  if (initialTimerId !== null) {
    clearTimeout(initialTimerId)
    initialTimerId = null
  }
  focusTick      = null
  visibilityTick = null
  installed      = false
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * React hook returning the live list of active (non-dismissed) alerts.
 * Re-renders when the alert list or dismissals change in any tab.
 */
export function useActiveAlerts(): HAAlert[] {
  const [alerts, setAlerts] = useState<HAAlert[]>(() => getActiveAlerts())
  useEffect(() => {
    const unsub = subscribeAlerts(() => setAlerts(getActiveAlerts()))
    return unsub
  }, [])
  return alerts
}
