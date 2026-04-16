/**
 * Human-readable markdown export for IndexRecord objects.
 *
 * Drive sync uses JSON (full IndexRecord) as the wire format — see syncEngine.ts.
 * This module is for on-demand export only (e.g., "Export to readable files" feature).
 *
 * Usage:
 *   import { exportMarkdown } from './markdownExport'
 *   const md = exportMarkdown(record)   // call when user requests a readable export
 */

import type { IndexRecord } from './localIndex'
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
      // Generic fallback — JSON with a title header
      return `# ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data, null, 2)}\n\`\`\`\n\n---\n*Exported by Property Manager · ${new Date().toISOString()}*\n`
  }
}

/**
 * Derive a suggested markdown filename for a record.
 * Uses the existing domainMarkdown filename functions where available.
 */
export function exportFilename(record: IndexRecord): string {
  return `${record.type}_${record.id.slice(0, 8)}.md`
}
