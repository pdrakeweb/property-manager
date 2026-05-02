/**
 * Persistent settings store — localStorage with env var defaults.
 *
 * Priority: localStorage (user-set) > VITE_* env var > hardcoded default.
 * Any value the user sets in the Settings screen persists across restarts.
 * Env vars act as initial seed values for dev/CI or first-run.
 */

const PREFIX = 'pm_settings_'

// ─── Setting definitions ──────────────────────────────────────────────────────

export interface SettingDef<T = string> {
  key: string
  envVar?: string
  defaultValue: T
}

export const SETTINGS = {
  openRouterKey: {
    key: 'openrouter_key',
    envVar: 'VITE_OPENROUTER_KEY',
    defaultValue: '',
  },
  haUrl: {
    key: 'ha_url',
    envVar: 'VITE_HA_URL',
    defaultValue: '',
  },
  haToken: {
    key: 'ha_token',
    envVar: 'VITE_HA_TOKEN',
    defaultValue: '',
  },
  // Model overrides per task — stored as JSON object
  modelOverrides: {
    key: 'model_overrides',
    envVar: undefined,
    defaultValue: '{}',
  },
} as const satisfies Record<string, SettingDef>

// ─── Read / Write ─────────────────────────────────────────────────────────────

/**
 * Static map of env-var defaults. Each value is read via a static
 * `import.meta.env.VITE_*` access so Vite only inlines THIS allow-list
 * into the bundle. A previous dynamic `import.meta.env[def.envVar]`
 * caused Vite to inline the full env object (including unrelated
 * VITE_* secrets) — see `getSetting` for the safe lookup path.
 */
const ENV_DEFAULTS: Record<string, string | undefined> = {
  VITE_OPENROUTER_KEY: import.meta.env.VITE_OPENROUTER_KEY as string | undefined,
  VITE_HA_URL:         import.meta.env.VITE_HA_URL         as string | undefined,
  VITE_HA_TOKEN:       import.meta.env.VITE_HA_TOKEN       as string | undefined,
}

/** Get a setting value. Checks localStorage first, then env var, then default. */
export function getSetting(def: SettingDef): string {
  const stored = localStorage.getItem(`${PREFIX}${def.key}`)
  if (stored !== null) return stored

  if (def.envVar) {
    const envVal = ENV_DEFAULTS[def.envVar]
    if (envVal !== undefined && envVal !== '') return envVal
  }

  return def.defaultValue
}

/** Set a setting value. Persists to localStorage. */
export function setSetting(def: SettingDef, value: string): void {
  localStorage.setItem(`${PREFIX}${def.key}`, value)
}

/** Clear a setting (reverts to env var or default on next read). */
export function clearSetting(def: SettingDef): void {
  localStorage.removeItem(`${PREFIX}${def.key}`)
}

// ─── Dev model override ───────────────────────────────────────────────────────

/**
 * VITE_MODEL_OVERRIDE — when set, ALL tasks use this model regardless of
 * per-task settings. Useful for dev/testing with a free or specific model.
 * Shows a visual indicator in the Settings UI.
 */
const DEV_MODEL_OVERRIDE = (import.meta.env.VITE_MODEL_OVERRIDE as string | undefined) ?? ''

/** Returns the dev override model, or empty string if none. */
export function getDevModelOverride(): string {
  return DEV_MODEL_OVERRIDE
}

/** Whether a dev model override is active. */
export function hasDevModelOverride(): boolean {
  return DEV_MODEL_OVERRIDE !== ''
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Get the OpenRouter API key. */
export function getOpenRouterKey(): string {
  return getSetting(SETTINGS.openRouterKey)
}

/** Get Home Assistant URL. */
export function getHaUrl(): string {
  return getSetting(SETTINGS.haUrl)
}

/** Get Home Assistant token. */
export function getHaToken(): string {
  return getSetting(SETTINGS.haToken)
}

/**
 * Get the model for a task.
 * Priority: VITE_MODEL_OVERRIDE (all tasks) > per-task override > default.
 */
export function getModelForTask(taskKey: string, defaultModel: string): string {
  if (DEV_MODEL_OVERRIDE) return DEV_MODEL_OVERRIDE

  try {
    const overrides = JSON.parse(getSetting(SETTINGS.modelOverrides)) as Record<string, string>
    return overrides[taskKey] ?? defaultModel
  } catch {
    return defaultModel
  }
}

/** Set model override for a task. */
export function setModelForTask(taskKey: string, model: string): void {
  try {
    const overrides = JSON.parse(getSetting(SETTINGS.modelOverrides)) as Record<string, string>
    overrides[taskKey] = model
    setSetting(SETTINGS.modelOverrides, JSON.stringify(overrides))
  } catch {
    setSetting(SETTINGS.modelOverrides, JSON.stringify({ [taskKey]: model }))
  }
}
