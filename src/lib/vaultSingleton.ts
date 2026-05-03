/**
 * Application-scoped vault singleton.
 *
 * Composes the extracted `@/vault` package with the host app's concrete
 * dependencies: browser `localStorage`, the DSL record registry, the
 * existing `propertyStore` and `auditLog`, and the live OAuth token.
 *
 * Dev-bypass mode (google_access_token === 'dev_token') transparently
 * swaps the Google Drive adapter for the localStorage-backed memory
 * adapter — identical behavior to the old `localDriveAdapter` shim, but
 * now the swap lives in one place rather than in every legacy entry point.
 */

import {
  buildRegistryFromDSL,
  createGoogleDriveAdapter,
  createMemoryAdapter,
  createRecordVault,
  type AuditLogger,
  type HostMetadataStore,
  type RecordVault,
  type StorageAdapter,
} from '../vault'
import { RECORDS } from '../records/registry'
import { CATEGORY_FOLDER_NAMES } from './driveClient'
import { propertyStore } from './propertyStore'
import { auditLog } from './auditLog'
import { syncBus } from './syncBus'
import { getDeviceId } from './deviceId'

const hostMetadata: HostMetadataStore = {
  getRootFolderId(propertyId: string): string | null {
    const p = propertyStore.getById(propertyId)
    return p?.driveRootFolderId ?? null
  },
}

const auditLogger: AuditLogger = {
  info:  (a, m, p) => auditLog.info(a, m, p),
  warn:  (a, m, p) => auditLog.warn(a, m, p),
  error: (a, m, p) => auditLog.error(a, m, p),
}

function pickStorage(): StorageAdapter {
  const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('google_access_token') : null) ?? ''
  if (token === 'dev_token') {
    // Dev-bypass: in-browser mock drive backed by localStorage so the state
    // survives reloads. Same contract as the real adapter — ETags and all.
    return createMemoryAdapter({ kvStore: localStorage, storeKey: 'pm_dev_drive_v1' })
  }
  return createGoogleDriveAdapter(() => {
    const t = localStorage.getItem('google_access_token')
    if (!t) throw new Error('No Google access token — sign in first')
    return t
  })
}

const registry = buildRegistryFromDSL({
  records: RECORDS,
  legacyFolderNames: CATEGORY_FOLDER_NAMES,
})

let cachedVault: RecordVault | null = null
let cachedToken: string | null = null

/**
 * Return the vault bound to the current token. We cache per-token so a
 * fresh sign-out/sign-in swap flips the storage adapter (dev-bypass ↔ live).
 */
export function getVault(): RecordVault {
  const current = (typeof localStorage !== 'undefined' ? localStorage.getItem('google_access_token') : null) ?? ''
  if (cachedVault && cachedToken === current) return cachedVault
  cachedToken = current
  cachedVault = createRecordVault({
    storage: pickStorage(),
    kvStore: localStorage,
    registry,
    host: hostMetadata,
    audit: auditLogger,
    deviceId: getDeviceId(),
  })
  // Forward every vault-internal index mutation onto the cross-tab syncBus
  // so subscribers (AppShell indicator, useRecordSync, detail screens) react
  // to remote pulls and background writes even though they didn't go through
  // the lib/localIndex.ts façade.
  cachedVault.localIndex.subscribe((ids, source) => {
    syncBus.emit({ type: 'index-updated', recordIds: [...ids], source })
  })
  return cachedVault
}

/** Force a vault rebuild on next `getVault()`. Used when tokens change. */
export function resetVault(): void {
  cachedVault = null
  cachedToken = null
}
