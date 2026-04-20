/**
 * Markdown-export façade over the vault.
 *
 * Delegates the heavy lifting to `vault.exportMarkdown`, preserving the
 * public API (`exportAllMarkdownToDrive`, `exportMarkdown`, `exportFilename`,
 * `kbFolderKey`, `getKnowledgebaseFolderId`) so existing callers in
 * `App.tsx`, `SyncScreen.tsx`, etc. do not need to change.
 */

import type { IndexRecord } from './localIndex'
import { getVault } from './vaultSingleton'
import { propertyStore } from './propertyStore'
import type { IndexRecord as VaultIndexRecord } from '../vault'

export function exportMarkdown(record: IndexRecord): string {
  return getVault().renderMarkdown(record as unknown as VaultIndexRecord)
}

export function exportFilename(record: IndexRecord): string {
  return getVault().markdownFilename(record as unknown as VaultIndexRecord)
}

export interface MarkdownExportResult {
  exported:   number
  skipped:    number
  failed:     number
  errors:     string[]
  kbFolderId?: string
}

/** localStorage key for the knowledgebase Drive folder ID per property. */
export function kbFolderKey(propertyId: string): string {
  return `pm_kb_folder_${propertyId}`
}

export function getKnowledgebaseFolderId(propertyId: string): string | null {
  return localStorage.getItem(kbFolderKey(propertyId))
}

export async function exportAllMarkdownToDrive(
  _token:      string,
  propertyId:  string,
  onProgress?: (completed: number, total: number) => void,
): Promise<MarkdownExportResult> {
  const property = propertyStore.getById(propertyId)
  if (!property?.driveRootFolderId) return { exported: 0, skipped: 0, failed: 0, errors: [] }

  // Cache the kb root folder id the way the old code did — a few screens
  // read this from localStorage to render a "View in Drive" link.
  localStorage.setItem(kbFolderKey(propertyId), property.driveRootFolderId)

  const result = await getVault().exportMarkdown(propertyId, property.name, onProgress)
  return result
}
