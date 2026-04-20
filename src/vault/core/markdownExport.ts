/**
 * Vault-side markdown export.
 *
 * Walks every record for a property, renders its .md via the registry, and
 * uploads (skipping unchanged filenames). Extracted from
 * `src/lib/markdownExport.ts`; the flow is identical, but the registry and
 * storage adapter are injected rather than imported.
 */

import type { AuditLogger, HostMetadataStore, IndexRecord, StorageAdapter, VaultRegistry } from './types'
import type { LocalIndex } from './localIndex'

export interface MarkdownExportContext {
  storage: StorageAdapter
  localIndex: LocalIndex
  registry: VaultRegistry
  host: HostMetadataStore
  audit: AuditLogger
}

export interface MarkdownExportResult {
  exported:   number
  skipped:    number
  failed:     number
  errors:     string[]
  kbFolderId?: string
}

export interface PropertyContext {
  propertyId: string
  propertyName: string
}

/** Render markdown for a single IndexRecord through the registry. */
export function renderRecordMarkdown(
  registry: VaultRegistry,
  record:   IndexRecord,
): string {
  const info = registry.get(record.type)
  if (info) return info.renderMarkdown(record.data)
  return `# ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data, null, 2)}\n\`\`\`\n\n---\n*Exported by Property Manager · ${new Date().toISOString()}*\n`
}

/** Pick a safe .md filename for a record. */
export function resolveMarkdownFilename(
  registry: VaultRegistry,
  record:   IndexRecord,
): string {
  const existing = record.data.filename as string | undefined
  if (existing?.endsWith('.md')) return existing

  const info = registry.get(record.type)
  if (info) return info.markdownFilename(record.data)

  const safe = record.title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50)
  return `${record.type}_${safe}_${record.id.slice(0, 8)}.md`
}

export async function exportAllMarkdown(
  ctx:         MarkdownExportContext,
  prop:        PropertyContext,
  onProgress?: (completed: number, total: number) => void,
): Promise<MarkdownExportResult> {
  const rootFolderId = ctx.host.getRootFolderId(prop.propertyId)
  if (!rootFolderId) return { exported: 0, skipped: 0, failed: 0, errors: [] }

  const records = ctx.localIndex.getAllForProperty(prop.propertyId)
  const total   = records.length

  let exported = 0
  let skipped  = 0
  const errors: string[] = []

  const folderCache    = new Map<string, string>()
  const existingFiles  = new Map<string, Set<string>>()
  const categoryCount  = new Map<string, number>()

  async function getCategoryFolder(categoryId: string, catName: string): Promise<string> {
    const cached = folderCache.get(categoryId)
    if (cached) return cached
    const folderId = await ctx.storage.ensureFolder(catName, rootFolderId!)
    folderCache.set(categoryId, folderId)
    return folderId
  }

  async function getExisting(folderId: string): Promise<Set<string>> {
    if (existingFiles.has(folderId)) return existingFiles.get(folderId)!
    const files = await ctx.storage.listFiles(folderId)
    const names = new Set(files.map(f => f.name))
    existingFiles.set(folderId, names)
    return names
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    onProgress?.(i, total)

    try {
      const filename   = resolveMarkdownFilename(ctx.registry, record)
      const categoryId = (record.data.categoryId as string) || record.categoryId || record.type
      const info       = ctx.registry.get(record.type)
      const catName    = info
        ? info.resolveFolderName(record.data)
        : ctx.registry.legacyFolderNames()[categoryId] ?? categoryId

      let folderId = folderCache.get(categoryId)
      if (folderId) {
        const existing = await getExisting(folderId)
        if (existing.has(filename)) {
          skipped++
          categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
          continue
        }
      } else {
        folderId = await getCategoryFolder(categoryId, catName)
        const existing = await getExisting(folderId)
        if (existing.has(filename)) {
          skipped++
          categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
          continue
        }
      }

      const md = renderRecordMarkdown(ctx.registry, record)
      await ctx.storage.uploadFile(folderId, filename, md, 'text/markdown')
      existingFiles.get(folderId)?.add(filename)
      exported++
      categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
    } catch (err) {
      errors.push(`${record.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // index.md
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
      `# ${prop.propertyName} — Property Manager Knowledgebase`,
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

    const rootFiles = await ctx.storage.listFiles(rootFolderId)
    const existingIndex = rootFiles.find(f => f.name === 'index.md')
    if (existingIndex) {
      await ctx.storage.updateFile(existingIndex.id, index, 'text/markdown')
    } else {
      await ctx.storage.uploadFile(rootFolderId, 'index.md', index, 'text/markdown')
    }
  } catch {
    /* non-fatal */
  }

  onProgress?.(total, total)
  return { exported, skipped, failed: errors.length, errors, kbFolderId: rootFolderId }
}
