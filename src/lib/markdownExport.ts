/**
 * Human-readable markdown export for IndexRecord objects.
 *
 * Drive sync uses JSON (full IndexRecord) as the wire format — see syncEngine.ts.
 * This module handles on-demand export of readable .md files to Drive.
 */

import type { IndexRecord } from './localIndex'
import { localIndex } from './localIndex'
import { DriveClient, CATEGORY_FOLDER_NAMES } from './driveClient'
import { localDriveAdapter } from './localDriveAdapter'
import { propertyStore } from './propertyStore'
import { getDefinition } from '../records/registry'
import { resolveFolderName } from '../records/_framework'
import { renderRecordMarkdown, recordFilename } from './dslMarkdown'

function drive(): typeof DriveClient {
  return localStorage.getItem('google_access_token') === 'dev_token'
    ? (localDriveAdapter as typeof DriveClient)
    : DriveClient
}

/**
 * Render a localIndex record as human-readable markdown.
 * Falls back to a generic JSON dump for types without a dedicated formatter.
 */
export function exportMarkdown(record: IndexRecord): string {
  const d = record.data as Record<string, unknown>

  // Registered DSL types render via the definition (custom override or default field walker).
  const def = getDefinition(record.type)
  if (def) return renderRecordMarkdown(def, d)

  // Unregistered types (e.g. `equipment`) fall back to a raw JSON dump.
  return `# ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data, null, 2)}\n\`\`\`\n\n---\n*Exported by Property Manager · ${new Date().toISOString()}*\n`
}

/** Derive a safe .md filename for a record. */
export function exportFilename(record: IndexRecord): string {
  // Equipment records already have a well-formed .md filename from capture
  const existing = record.data.filename as string | undefined
  if (existing?.endsWith('.md')) return existing

  // Registered DSL types resolve their own filename convention
  const def = getDefinition(record.type)
  if (def) return recordFilename(def, record.data as Record<string, unknown>)

  const safe = record.title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50)
  return `${record.type}_${safe}_${record.id.slice(0, 8)}.md`
}

export interface MarkdownExportResult {
  exported:       number
  skipped:        number
  failed:         number
  errors:         string[]
  kbFolderId?:    string
}

/** localStorage key for the knowledgebase Drive folder ID per property. */
export function kbFolderKey(propertyId: string): string {
  return `pm_kb_folder_${propertyId}`
}

/** Return the cached knowledgebase Drive folder ID for a property (if it has been synced). */
export function getKnowledgebaseFolderId(propertyId: string): string | null {
  return localStorage.getItem(kbFolderKey(propertyId))
}

/**
 * Export all records for a property as human-readable markdown files to Drive.
 *
 * Structure written to Drive:
 *   [driveRootFolderId]/
 *     Property Manager/
 *       Knowledgebase/
 *         index.md
 *         Generator/
 *           equipment_xxx.md
 *         HVAC/
 *           equipment_yyy.md
 *         ...
 *
 * @param onProgress  called after each record: (completed, total)
 */
export async function exportAllMarkdownToDrive(
  token:       string,
  propertyId:  string,
  onProgress?: (completed: number, total: number) => void,
): Promise<MarkdownExportResult> {
  const property = propertyStore.getById(propertyId)
  if (!property?.driveRootFolderId) return { exported: 0, skipped: 0, failed: 0, errors: [] }

  const rootFolderId = property.driveRootFolderId
  const records = localIndex.getAllForProperty(propertyId)
  const total   = records.length

  let exported = 0
  let skipped  = 0
  const errors: string[] = []

  // KB lives directly in the property root folder (no extra subfolder)
  localStorage.setItem(kbFolderKey(propertyId), rootFolderId)

  // Cache resolved category folder IDs and their existing filenames
  const folderCache    = new Map<string, string>()
  const existingFiles  = new Map<string, Set<string>>()  // folderId → Set of filenames
  const categoryCount  = new Map<string, number>()

  async function getCategoryFolder(categoryId: string, catName: string): Promise<string> {
    const cached = folderCache.get(categoryId)
    if (cached) return cached
    const folderId = await drive().ensureFolder(token, catName, rootFolderId)
    folderCache.set(categoryId, folderId)
    return folderId
  }

  async function getExisting(folderId: string): Promise<Set<string>> {
    if (existingFiles.has(folderId)) return existingFiles.get(folderId)!
    const files = await drive().listFiles(token, folderId)
    const names = new Set(files.map(f => f.name))
    existingFiles.set(folderId, names)
    return names
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    onProgress?.(i, total)

    try {
      const filename   = exportFilename(record)
      const categoryId = (record.data.categoryId as string) || record.categoryId || record.type
      const def        = getDefinition(record.type)
      // Variant-aware resolution: equipment records branch to subsystem folders
      // via the registered variant; plain record types use the base folderName.
      const catName =
        (def ? resolveFolderName(def, record.data as Record<string, unknown>) : null)
        ?? CATEGORY_FOLDER_NAMES[categoryId]
        ?? categoryId

      // Check existing files before creating the folder — need folder ID for listing
      // Lazily create the folder only on first file that needs to go there
      let folderId = folderCache.get(categoryId)

      if (folderId) {
        // Folder already resolved — check if file exists
        const existing = await getExisting(folderId)
        if (existing.has(filename)) {
          skipped++
          categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
          continue
        }
      } else {
        // Folder not yet resolved — check root listing to see if folder exists
        // but don't create it yet; we'll create when we need to upload
        // For now, resolve the folder and check
        folderId = await getCategoryFolder(categoryId, catName)
        const existing = await getExisting(folderId)
        if (existing.has(filename)) {
          skipped++
          categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
          continue
        }
      }

      const md = exportMarkdown(record)
      await drive().uploadFile(token, folderId, filename, md, 'text/markdown')
      // Update the cached existing set so we don't re-upload in the same run
      existingFiles.get(folderId)?.add(filename)
      exported++
      categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
    } catch (err) {
      errors.push(`${record.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Generate and upload index.md directly to root
  try {
    const now = new Date().toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
    const categoryRows = [...categoryCount.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, count]) => `| ${cat} | ${count} |`)
      .join('\n')

    const index = [
      `# ${property.name} — Property Manager Knowledgebase`,
      '',
      `*Last updated: ${now}*`,
      '',
      `**${exported + skipped}** record${(exported + skipped) !== 1 ? 's' : ''} across ${categoryCount.size} categor${categoryCount.size !== 1 ? 'ies' : 'y'}`,
      '',
      '## Records by Category',
      '',
      '| Category | Records |',
      '|----------|---------|',
      categoryRows,
      '',
      '---',
      '*Auto-generated by Property Manager. Regenerated every 6 hours when the app is open.*',
    ].join('\n')

    // Update index.md if it already exists, create if not
    const rootFiles = await drive().listFiles(token, rootFolderId)
    const existingIndex = rootFiles.find(f => f.name === 'index.md')
    if (existingIndex) {
      await drive().updateFile(token, existingIndex.id, index, 'text/markdown')
    } else {
      await drive().uploadFile(token, rootFolderId, 'index.md', index, 'text/markdown')
    }
  } catch {
    // Non-fatal — records still exported even if index fails
  }

  onProgress?.(total, total)
  return { exported, skipped, failed: errors.length, errors, kbFolderId: rootFolderId }
}
