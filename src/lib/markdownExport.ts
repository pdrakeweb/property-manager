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
import {
  formatMaintenanceTask,
  formatCompletedEvent,
  formatCapitalTransaction,
  formatFuelDelivery,
  formatSepticEvent,
  formatWellTest,
  formatTaxAssessment,
  formatTaxPayment,
  formatMortgage,
  formatMortgagePayment,
  formatUtilityAccount,
  formatUtilityBill,
  formatVendor,
  formatInsurance,
  formatPermit,
  formatRoadEvent,
  formatGenerator,
} from './domainMarkdown'
import type { MaintenanceTask } from '../types'
import type {
  CompletedEvent, FuelDelivery, SepticEvent, WellTest,
  TaxAssessment, TaxPayment, Mortgage, MortgagePayment,
  UtilityAccount, UtilityBill, Vendor,
} from '../schemas'
import type { InsurancePolicy } from '../types/insurance'
import type { Permit } from '../types/permits'
import type { RoadEvent } from '../types/road'
import type { GeneratorRecord } from '../types/generator'
import type { CapitalTransaction } from '../types'

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

  switch (record.type) {
    case 'task':
      return formatMaintenanceTask(d as unknown as MaintenanceTask)

    case 'completed_event':
      return formatCompletedEvent(d as unknown as CompletedEvent)

    case 'capital_transaction':
      return formatCapitalTransaction(d as unknown as CapitalTransaction)

    case 'fuel_delivery':
      return formatFuelDelivery(d as unknown as FuelDelivery)

    case 'septic_event':
      return formatSepticEvent(d as unknown as SepticEvent)

    case 'well_test':
      return formatWellTest(d as unknown as WellTest)

    case 'tax_assessment':
      return formatTaxAssessment(d as unknown as TaxAssessment)

    case 'tax_payment':
      return formatTaxPayment(d as unknown as TaxPayment)

    case 'mortgage':
      return formatMortgage(d as unknown as Mortgage)

    case 'mortgage_payment':
      return formatMortgagePayment(d as unknown as MortgagePayment)

    case 'utility_account':
      return formatUtilityAccount(d as unknown as UtilityAccount)

    case 'utility_bill':
      return formatUtilityBill(d as unknown as UtilityBill)

    case 'vendor':
      return formatVendor(d as unknown as Vendor)

    case 'insurance':
      return formatInsurance(d as unknown as InsurancePolicy)

    case 'permit':
      return formatPermit(d as unknown as Permit)

    case 'road':
      return formatRoadEvent(d as unknown as RoadEvent)

    case 'generator_log':
      return formatGenerator(d as unknown as GeneratorRecord)

    default:
      return `# ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data, null, 2)}\n\`\`\`\n\n---\n*Exported by Property Manager · ${new Date().toISOString()}*\n`
  }
}

/** Derive a safe .md filename for a record. */
export function exportFilename(record: IndexRecord): string {
  // Equipment records already have a well-formed .md filename from capture
  const existing = record.data.filename as string | undefined
  if (existing?.endsWith('.md')) return existing

  const safe = record.title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50)
  return `${record.type}_${safe}_${record.id.slice(0, 8)}.md`
}

export interface MarkdownExportResult {
  exported:       number
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
  if (!property?.driveRootFolderId) return { exported: 0, failed: 0, errors: [] }

  const rootFolderId = property.driveRootFolderId
  const records = localIndex.getAllForProperty(propertyId)
  const total   = records.length

  let exported = 0
  const errors: string[] = []

  // Resolve (or create) Knowledgebase folder
  const kbFolderId = await drive().resolveKnowledgebaseFolder(token, rootFolderId)
  localStorage.setItem(kbFolderKey(propertyId), kbFolderId)

  // Cache resolved category folder IDs under Knowledgebase/
  const folderCache = new Map<string, string>()
  const categoryCount = new Map<string, number>()

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    onProgress?.(i, total)

    try {
      const md         = exportMarkdown(record)
      const filename   = exportFilename(record)
      const categoryId = (record.data.categoryId as string) || record.categoryId || record.type
      const catName    = CATEGORY_FOLDER_NAMES[categoryId] ?? categoryId

      let folderId = folderCache.get(categoryId)
      if (!folderId) {
        folderId = await drive().ensureFolder(token, catName, kbFolderId)
        folderCache.set(categoryId, folderId)
      }

      await drive().uploadFile(token, folderId, filename, md, 'text/markdown')
      exported++
      categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1)
    } catch (err) {
      errors.push(`${record.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Generate and upload index.md
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
      `**${exported}** record${exported !== 1 ? 's' : ''} across ${categoryCount.size} categor${categoryCount.size !== 1 ? 'ies' : 'y'}`,
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

    await drive().uploadFile(token, kbFolderId, 'index.md', index, 'text/markdown')
  } catch {
    // Non-fatal — records still exported even if index fails
  }

  onProgress?.(total, total)
  return { exported, failed: errors.length, errors, kbFolderId }
}
