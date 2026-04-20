/**
 * Shared fixtures for vault unit and functional tests.
 *
 * We build a tiny in-test VaultRegistry so the tests never pull in the
 * real DSL registry (which imports Zod, schemas, and 20+ record types).
 * This keeps failures localized to the layer under test.
 */

import type {
  HostMetadataStore,
  IndexRecord,
  KVStore,
  VaultRegistry,
  VaultTypeInfo,
} from '../core/types'

export function testRegistry(): VaultRegistry {
  const vendor: VaultTypeInfo = {
    type: 'vendor',
    folderName: 'Vendors',
    resolveFolderName: () => 'Vendors',
    resolveTitle: (d) => String(d.name ?? 'Unnamed Vendor'),
    renderMarkdown: (d) => `# Vendor: ${String(d.name)}\n\n- Phone: ${String(d.phone ?? '')}\n`,
    markdownFilename: (d) => `vendor_${String(d.name ?? 'unnamed').replace(/\W+/g, '_')}.md`,
  }

  const task: VaultTypeInfo = {
    type: 'task',
    folderName: 'Tasks',
    resolveFolderName: () => 'Tasks',
    resolveTitle: (d) => String(d.title ?? 'Untitled Task'),
    renderMarkdown: (d) => `# Task: ${String(d.title)}\n\n- Due: ${String(d.dueDate ?? '')}\n`,
    markdownFilename: (d) => `task_${String(d.id ?? 'x').slice(0, 6)}.md`,
  }

  const map: Record<string, VaultTypeInfo> = { vendor, task }

  return {
    allTypes: () => Object.keys(map),
    get: (type) => map[type] ?? null,
    legacyFolderNames: () => ({ equipment: 'Equipment' }),
  }
}

export function testHost(map: Record<string, string | null>): HostMetadataStore {
  return { getRootFolderId: (propertyId) => map[propertyId] ?? null }
}

export function memoryKV(): KVStore {
  const data: Record<string, string> = {}
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
  }
}

export function makeVendorRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    id:             'v1',
    type:           'vendor',
    propertyId:     'prop-1',
    title:          'Ohio HVAC',
    data:           { id: 'v1', name: 'Ohio HVAC', phone: '555-1234' },
    syncState:      'pending_upload',
    localUpdatedAt: new Date('2026-04-20T12:00:00Z').toISOString(),
    ...overrides,
  }
}

export interface RecordedAudit {
  level: 'info' | 'warn' | 'error'
  action: string
  message: string
  propertyId?: string
}

export function recordingAudit(): { entries: RecordedAudit[]; logger: import('../core/types').AuditLogger } {
  const entries: RecordedAudit[] = []
  return {
    entries,
    logger: {
      info:  (action, message, propertyId) => entries.push({ level: 'info',  action, message, propertyId }),
      warn:  (action, message, propertyId) => entries.push({ level: 'warn',  action, message, propertyId }),
      error: (action, message, propertyId) => entries.push({ level: 'error', action, message, propertyId }),
    },
  }
}
