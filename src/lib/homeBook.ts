/**
 * Home Book — comprehensive property record collector.
 *
 * Collects every record we know about a property and shapes it for the
 * print-ready HTML renderer in `homeBookPdf.ts`. This is pure data — no
 * formatting, no DOM. Pulls from `localIndex` (equipment, completed events,
 * tasks) and the per-record DSL stores (insurance, permits, mortgages, etc.).
 *
 * The orchestrator stays tolerant: any store that throws or returns nothing
 * yields an empty list rather than aborting the export.
 */

import type { Property, EquipmentRecord, ServiceRecord, MaintenanceTask, CapitalItem } from '../types'
import type { InsurancePolicy } from '../types/insurance'
import type { Permit } from '../types/permits'
import type { GeneratorRecord } from '../types/generator'
import type { RoadEvent } from '../types/road'
import type {
  Mortgage, WellTest, SepticEvent, FuelDelivery,
  TaxAssessment, TaxPayment, UtilityAccount, UtilityBill,
} from '../schemas'
import type { Inspection } from './inspectionStore'
import type { PropertyRiskBrief } from './riskBriefStore'

import { propertyStore } from './propertyStore'
import { localIndex } from './localIndex'
import { getActiveTasks } from './maintenanceStore'
import { getCapitalItemsForProperty } from './capitalItemStore'
import { getPoliciesForProperty } from './insuranceStore'
import { getPermitsForProperty } from './permitStore'
import { getMortgagesForProperty } from './mortgageStore'
import { getGeneratorsForProperty } from './generatorStore'
import { getRoadEventsForProperty } from './roadStore'
import { getDeliveriesForProperty } from './fuelStore'
import { getAccountsForProperty, getBillsForProperty } from './utilityStore'
import { getAssessmentsForProperty, getPaymentsForProperty as getTaxPaymentsForProperty } from './taxStore'
import { getTestsForProperty as getWellTestsForProperty } from './wellTestStore'
import { getEventsForProperty as getSepticEventsForProperty } from './septicStore'
import { getInspectionsForProperty } from './inspectionStore'
import { getLatestBrief } from './riskBriefStore'
import { getNarrativeText } from './narrativeStore'
import { CATEGORIES } from '../data/mockData'

// ─── Service record mapper (mirror of PropertyRecordsAPI's mapper) ───────────

function indexToServiceRecord(r: { id: string; propertyId: string; title?: string; data?: unknown }): ServiceRecord {
  const data = (r.data ?? {}) as Record<string, unknown>
  return {
    id:              r.id,
    propertyId:      r.propertyId,
    date:            (data.completionDate as string | undefined) ?? '',
    systemLabel:     (data.taskTitle      as string | undefined) ?? r.title ?? '',
    contractor:      data.contractor as string | undefined,
    workDescription: (data.notes          as string | undefined) ?? '',
    totalCost:       data.cost as number | undefined,
  }
}

function indexToEquipment(r: { id: string; propertyId: string; categoryId?: string; title?: string; data?: unknown; driveFileId?: string }): EquipmentRecord {
  const data       = (r.data ?? {}) as Record<string, unknown>
  const values     = (data.values ?? {}) as Record<string, string>
  const categoryId = (data.categoryId as string | undefined) ?? r.categoryId ?? ''

  const brand        = values.brand
  const model        = values.model || values.model_number
  const serialNumber = values.serial_number
  const location     = values.location
  const lastService  = values.last_service_date || values.last_pumped || values.last_test_date

  const installDate = values.install_date
  const installYear = installDate?.slice(0, 4)
    ? Number(installDate.slice(0, 4)) || undefined
    : (values.tank_age_year ? Number(values.tank_age_year) || undefined : undefined)
  const age = installYear ? new Date().getFullYear() - installYear : undefined

  const label = r.title
    || [brand, model].filter(Boolean).join(' ')
    || `Equipment · ${categoryId}`

  return {
    id:              r.id,
    propertyId:      r.propertyId,
    categoryId,
    label,
    brand,
    model,
    serialNumber,
    installYear,
    age,
    location,
    lastServiceDate: lastService,
    uploadStatus:    'uploaded',
    hasPhotos:       false,
    driveFileId:     r.driveFileId,
  }
}

// ─── Section IDs ─────────────────────────────────────────────────────────────

export const HOME_BOOK_SECTION_IDS = [
  'overview',
  'narrative',
  'equipment',
  'maintenance',
  'inspections',
  'capital',
  'wellTests',
  'septic',
  'insurance',
  'permits',
  'mortgages',
  'tax',
  'utilities',
  'fuel',
  'generators',
  'road',
  'risk',
] as const

export type HomeBookSectionId = typeof HOME_BOOK_SECTION_IDS[number]

export interface HomeBookSectionMeta {
  id:          HomeBookSectionId
  title:       string
  description: string
}

export const HOME_BOOK_SECTIONS: readonly HomeBookSectionMeta[] = [
  { id: 'overview',    title: 'Property Overview',     description: 'Address, type, year built, acreage' },
  { id: 'narrative',   title: 'Owner Narrative',       description: 'Owner-provided context about the property' },
  { id: 'equipment',   title: 'Equipment & Systems',   description: 'Every documented system with brand, model, install date' },
  { id: 'maintenance', title: 'Maintenance History',   description: 'Completed service work, last 2 years' },
  { id: 'inspections', title: 'Condition Assessments', description: 'Inspections with severity and findings' },
  { id: 'capital',     title: 'Capital Projects',      description: 'Planned and completed major work' },
  { id: 'wellTests',   title: 'Well Water Tests',      description: 'Lab results and parameters' },
  { id: 'septic',      title: 'Septic History',        description: 'Pumping and inspection events' },
  { id: 'insurance',   title: 'Insurance Policies',    description: 'Active coverage with renewal dates' },
  { id: 'permits',     title: 'Permits & Inspections', description: 'Building, electrical, plumbing, etc.' },
  { id: 'mortgages',   title: 'Mortgages & Loans',     description: 'Lender, balance, rate, term' },
  { id: 'tax',         title: 'Property Tax',          description: 'Assessments and payments' },
  { id: 'utilities',   title: 'Utility Accounts',      description: 'Providers and recent bills' },
  { id: 'fuel',        title: 'Fuel Deliveries',       description: 'Propane, oil, etc. — recent deliveries' },
  { id: 'generators',  title: 'Generators',            description: 'Runtime hours and service history' },
  { id: 'road',        title: 'Road & Access',         description: 'Driveway and gravel maintenance log' },
  { id: 'risk',        title: 'Risk Brief',            description: 'AI-generated predictive risk assessment' },
] as const

// ─── Aggregated payload ──────────────────────────────────────────────────────

export interface HomeBookCategoryRef {
  id:    string
  label: string
}

export interface HomeBookEquipmentEntry extends EquipmentRecord {
  category?: HomeBookCategoryRef
  /** Service records targeting this equipment, latest first (best-effort match by systemLabel substring). */
  serviceRecords: ServiceRecord[]
}

export interface HomeBookData {
  property:        Property
  generatedAt:     string                          // ISO
  preparedBy:      string
  narrative:       string                          // formatted multi-line text
  equipment:       HomeBookEquipmentEntry[]
  maintenance:     ServiceRecord[]                 // last 2 years
  upcomingTasks:   MaintenanceTask[]               // active, not completed
  inspections:     Inspection[]
  capital:         CapitalItem[]
  wellTests:       WellTest[]
  septic:          SepticEvent[]
  insurance:       InsurancePolicy[]
  permits:         Permit[]
  mortgages:       Mortgage[]
  taxAssessments:  TaxAssessment[]
  taxPayments:     TaxPayment[]
  utilityAccounts: UtilityAccount[]
  utilityBills:    UtilityBill[]
  fuelDeliveries:  FuelDelivery[]
  generators:      GeneratorRecord[]
  roadEvents:      RoadEvent[]
  riskBrief?:      PropertyRiskBrief
}

// ─── Collector ───────────────────────────────────────────────────────────────

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

const TWO_YEARS_AGO = (): string => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

function categoryFor(id: string): HomeBookCategoryRef | undefined {
  const c = CATEGORIES.find(cat => cat.id === id)
  return c ? { id: c.id, label: c.label } : undefined
}

/**
 * Collect every record this property has. Returns a frozen snapshot — the
 * caller can render it, save it, or compare to a prior snapshot.
 *
 * `preparedBy` is a free-form string the user can override (defaults to the
 * Google account name). Throws only if the property does not exist.
 */
export function collectHomeBook(propertyId: string, preparedBy: string): HomeBookData {
  const property = propertyStore.getById(propertyId)
  if (!property) throw new Error(`Property not found: ${propertyId}`)

  const equipmentRaw = safe(() => localIndex.getAll('equipment', propertyId), [])
  const services     = safe(
    () => localIndex.getAll('completed_event', propertyId)
      .map(indexToServiceRecord)
      .filter(r => r.date)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [] as ServiceRecord[],
  )

  const equipment: HomeBookEquipmentEntry[] = equipmentRaw
    .map(indexToEquipment)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(eq => ({
      ...eq,
      category: categoryFor(eq.categoryId),
      serviceRecords: services.filter(s => {
        const label = s.systemLabel.toLowerCase()
        const eqLabel = eq.label.toLowerCase()
        if (!label || !eqLabel) return false
        return label.includes(eqLabel) || eqLabel.includes(label)
      }),
    }))

  const cutoff = TWO_YEARS_AGO()
  const recentMaintenance = services.filter(s => s.date >= cutoff)

  const upcomingTasks = safe(
    () => getActiveTasks(propertyId).filter(t => t.status !== 'completed')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [] as MaintenanceTask[],
  )

  return {
    property,
    generatedAt:     new Date().toISOString(),
    preparedBy:      preparedBy.trim() || 'Owner',
    narrative:       safe(() => getNarrativeText(propertyId), ''),
    equipment,
    maintenance:     recentMaintenance,
    upcomingTasks,
    inspections:     safe(() => getInspectionsForProperty(propertyId)
      .sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)), [] as Inspection[]),
    capital:         safe(() => getCapitalItemsForProperty(propertyId), [] as CapitalItem[]),
    wellTests:       safe(() => getWellTestsForProperty(propertyId), [] as WellTest[]),
    septic:          safe(() => getSepticEventsForProperty(propertyId), [] as SepticEvent[]),
    insurance:       safe(() => getPoliciesForProperty(propertyId), [] as InsurancePolicy[]),
    permits:         safe(() => getPermitsForProperty(propertyId), [] as Permit[]),
    mortgages:       safe(() => getMortgagesForProperty(propertyId), [] as Mortgage[]),
    taxAssessments:  safe(() => getAssessmentsForProperty(propertyId), [] as TaxAssessment[]),
    taxPayments:     safe(() => getTaxPaymentsForProperty(propertyId), [] as TaxPayment[]),
    utilityAccounts: safe(() => getAccountsForProperty(propertyId), [] as UtilityAccount[]),
    utilityBills:    safe(() => getBillsForProperty(propertyId), [] as UtilityBill[]),
    fuelDeliveries:  safe(() => getDeliveriesForProperty(propertyId), [] as FuelDelivery[]),
    generators:      safe(() => getGeneratorsForProperty(propertyId), [] as GeneratorRecord[]),
    roadEvents:      safe(() => getRoadEventsForProperty(propertyId), [] as RoadEvent[]),
    riskBrief:       safe(() => getLatestBrief(propertyId), undefined),
  }
}

/**
 * Whether a section has any data worth rendering. Used by the renderer to
 * skip entirely empty sections rather than printing "None on record" for
 * every category on a fresh property.
 */
export function sectionHasData(data: HomeBookData, id: HomeBookSectionId): boolean {
  switch (id) {
    case 'overview':    return true
    case 'narrative':   return data.narrative.trim().length > 0
    case 'equipment':   return data.equipment.length > 0
    case 'maintenance': return data.maintenance.length > 0 || data.upcomingTasks.length > 0
    case 'inspections': return data.inspections.length > 0
    case 'capital':     return data.capital.length > 0
    case 'wellTests':   return data.wellTests.length > 0
    case 'septic':      return data.septic.length > 0
    case 'insurance':   return data.insurance.length > 0
    case 'permits':     return data.permits.length > 0
    case 'mortgages':   return data.mortgages.length > 0
    case 'tax':         return data.taxAssessments.length > 0 || data.taxPayments.length > 0
    case 'utilities':   return data.utilityAccounts.length > 0 || data.utilityBills.length > 0
    case 'fuel':        return data.fuelDeliveries.length > 0
    case 'generators':  return data.generators.length > 0
    case 'road':        return data.roadEvents.length > 0
    case 'risk':        return !!data.riskBrief && data.riskBrief.risks.length > 0
  }
}
