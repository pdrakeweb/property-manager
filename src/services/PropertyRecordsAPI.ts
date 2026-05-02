/**
 * Property Records API — provides structured access to property data.
 *
 * The AI interacts with this service rather than raw stores directly.
 * Pulls from localIndex + individual store modules.
 */

import { CATEGORIES } from '../data/mockData'
import { getCapitalItemsForProperty } from '../lib/capitalItemStore'
import { propertyStore } from '../lib/propertyStore'
import { getActiveTasks } from '../lib/maintenanceStore'
import { localIndex, type IndexRecord } from '../lib/localIndex'
import { fetchEntityState } from '../lib/haClient'
import { DriveClient } from '../lib/driveClient'
import { getGeneratorsForProperty } from '../lib/generatorStore'
import { getPoliciesForProperty } from '../lib/insuranceStore'
import { getPermitsForProperty } from '../lib/permitStore'
import { getRoadEventsForProperty } from '../lib/roadStore'
import { getDeliveriesForProperty } from '../lib/fuelStore'
import { getAccountsForProperty } from '../lib/utilityStore'
import { getAssessmentsForProperty } from '../lib/taxStore'
import { getMortgagesForProperty } from '../lib/mortgageStore'
import { getYTDSpend } from '../lib/costStore'
import { getUpcomingExpiries } from '../lib/expiryStore'
import { getNarrativeText } from '../lib/narrativeStore'
import type {
  Property, EquipmentRecord, MaintenanceTask, CapitalItem,
  ServiceRecord, HAStatus, HAEntityState, Category, UploadStatus,
} from '../types'

// ─── Related file pointer ──────────────────────────────────────────────────────

export interface RelatedFile {
  fileId: string
  name: string
  type: string
  description: string
}

export interface EquipmentWithFiles extends EquipmentRecord {
  relatedFiles: RelatedFile[]
  category?: Category
}

export interface SearchResult {
  recordType: 'equipment' | 'maintenance' | 'capital' | 'service'
  id: string
  label: string
  summary: string
  relatedFiles: RelatedFile[]
}

// ─── Index record mappers ─────────────────────────────────────────────────────

function syncStateToUploadStatus(state: IndexRecord['syncState']): UploadStatus {
  switch (state) {
    case 'synced':         return 'uploaded'
    case 'pending_upload': return 'pending'
    case 'conflict':       return 'error'
    default:               return 'draft'
  }
}

/** Map a localIndex equipment record to an `EquipmentRecord`. */
function indexToEquipment(r: IndexRecord): EquipmentRecord {
  const data       = (r.data ?? {}) as Record<string, unknown>
  const values     = (data.values ?? {}) as Record<string, string>
  const categoryId = (data.categoryId as string | undefined) ?? r.categoryId ?? ''
  const haEntityId = data.haEntityId as string | undefined

  // Brand/model live in `values`. Fall back to the title produced by capture.
  const brand        = values.brand
  const model        = values.model || values.model_number
  const serialNumber = values.serial_number
  const location     = values.location
  const lastService  = values.last_service_date || values.last_pumped || values.last_test_date

  const installDate  = values.install_date
  const installYear  = installDate?.slice(0, 4)
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
    uploadStatus:    syncStateToUploadStatus(r.syncState),
    hasPhotos:       false,
    driveFileId:     r.driveFileId,
    haEntityId,
  }
}

/** Map a completed_event index record to a legacy-shaped `ServiceRecord`. */
function indexToServiceRecord(r: IndexRecord): ServiceRecord {
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

function entityStateToHAStatus(es: HAEntityState, fallbackLabel: string): HAStatus {
  const state    = es.state
  const friendly = (es.attributes?.['friendly_name'] as string | undefined) ?? fallbackLabel
  const unit     = es.attributes?.['unit_of_measurement'] as string | undefined

  let status: HAStatus['status'] = 'ok'
  const lower = state.toLowerCase()
  if (state === '' || lower === 'unknown' || lower === 'unavailable') status = 'unknown'
  else if (lower === 'off' || lower === 'closed' || lower === 'false') status = 'off'
  else if (lower === 'on'  || lower === 'open'   || lower === 'true')  status = 'ok'

  return { entityId: es.entity_id, label: friendly, value: state, unit, status }
}

// ─── API Class ─────────────────────────────────────────────────────────────────

export class PropertyRecordsAPI {
  private propertyId: string
  private driveToken: string | null

  constructor(propertyId: string, driveToken?: string | null) {
    this.propertyId = propertyId
    this.driveToken = driveToken ?? null
  }

  getProperty(): Property | undefined {
    return propertyStore.getById(this.propertyId) ?? undefined
  }

  private getEquipmentRecords(): EquipmentRecord[] {
    return localIndex.getAll('equipment', this.propertyId).map(indexToEquipment)
  }

  getEquipment(id?: string): EquipmentWithFiles | EquipmentWithFiles[] {
    const records = this.getEquipmentRecords()

    const enrich = (e: EquipmentRecord): EquipmentWithFiles => ({
      ...e,
      category: CATEGORIES.find(c => c.id === e.categoryId),
      relatedFiles: this.buildRelatedFiles(e),
    })

    if (id) {
      const record = records.find(e => e.id === id)
      if (!record) return [] as unknown as EquipmentWithFiles
      return enrich(record)
    }
    return records.map(enrich)
  }

  getMaintenanceTasks(filter?: {
    status?: string
    categoryId?: string
  }): MaintenanceTask[] {
    let tasks = getActiveTasks(this.propertyId)

    if (filter?.status) {
      tasks = tasks.filter(t => t.status === filter.status)
    }
    if (filter?.categoryId) {
      tasks = tasks.filter(t => t.categoryId === filter.categoryId)
    }

    const order: Record<string, number> = { overdue: 0, due: 1, upcoming: 2, completed: 3 }
    return tasks.sort((a, b) => {
      const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4)
      if (diff !== 0) return diff
      return a.dueDate.localeCompare(b.dueDate)
    })
  }

  getCapitalForecast(filter?: {
    priority?: string
    year?: number
  }): CapitalItem[] {
    let items = getCapitalItemsForProperty(this.propertyId)

    if (filter?.priority) {
      items = items.filter(c => c.priority === filter.priority)
    }
    if (filter?.year) {
      items = items.filter(c => c.estimatedYear === filter.year)
    }

    const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return items.sort((a, b) => {
      const diff = (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4)
      if (diff !== 0) return diff
      return a.estimatedYear - b.estimatedYear
    })
  }

  private getServiceRecords(): ServiceRecord[] {
    return localIndex.getAll('completed_event', this.propertyId)
      .map(indexToServiceRecord)
      .filter(r => r.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)
  }

  getServiceHistory(filter?: {
    systemLabel?: string
    afterDate?: string
    beforeDate?: string
  }): ServiceRecord[] {
    let records = this.getServiceRecords()

    if (filter?.systemLabel) {
      const q = filter.systemLabel.toLowerCase()
      records = records.filter(s => s.systemLabel.toLowerCase().includes(q))
    }
    if (filter?.afterDate) {
      records = records.filter(s => s.date >= filter.afterDate!)
    }
    if (filter?.beforeDate) {
      records = records.filter(s => s.date <= filter.beforeDate!)
    }

    return records.sort((a, b) => b.date.localeCompare(a.date))
  }

  /**
   * Live HA status for every equipment record that has a linked entity.
   * Returns `[]` if HA is unconfigured or unreachable; individual entity
   * fetch failures are silently dropped so a partial outage still yields
   * useful context for the AI.
   */
  async getHAStatus(): Promise<HAStatus[]> {
    const linked = this.getEquipmentRecords().filter(e => e.haEntityId)
    if (linked.length === 0) return []

    const results = await Promise.all(
      linked.map(async (e) => {
        try {
          const state = await fetchEntityState(e.haEntityId!)
          if (!state) return null
          return entityStateToHAStatus(state, e.label)
        } catch {
          return null
        }
      }),
    )

    return results.filter((s): s is HAStatus => s !== null)
  }

  getCategories(): Category[] {
    const prop = this.getProperty()
    if (!prop) return CATEGORIES
    return CATEGORIES.filter(c => c.propertyTypes.includes(prop.type))
  }

  /** Get additional property data from store modules */
  getExtendedContext(): string {
    const lines: string[] = []
    const pid = this.propertyId

    // Generator runtime data
    const generators = getGeneratorsForProperty(pid)
    if (generators.length > 0) {
      lines.push(`GENERATORS: ${generators.length} tracked`)
      for (const g of generators) {
        lines.push(`- ${g.name}: ${g.cumulativeHours ?? 0}hrs total`)
      }
    }

    // Insurance
    const policies = getPoliciesForProperty(pid)
    if (policies.length > 0) {
      lines.push(`INSURANCE: ${policies.length} policies`)
      for (const p of policies) {
        lines.push(`- ${p.type}: ${p.insurer}, renewal ${p.renewalDate}`)
      }
    }

    // Permits
    const permits = getPermitsForProperty(pid)
    if (permits.length > 0) {
      lines.push(`PERMITS: ${permits.length} tracked`)
      for (const p of permits) {
        lines.push(`- ${p.type}: ${p.status}, expires ${p.expiryDate ?? 'N/A'}`)
      }
    }

    // Fuel
    const deliveries = getDeliveriesForProperty(pid)
    if (deliveries.length > 0) {
      lines.push(`FUEL DELIVERIES: ${deliveries.length} recorded, last: ${deliveries[0]?.date ?? 'N/A'}`)
    }

    // Utilities
    const accounts = getAccountsForProperty(pid)
    if (accounts.length > 0) {
      lines.push(`UTILITY ACCOUNTS: ${accounts.map(a => a.type).join(', ')}`)
    }

    // Tax
    const assessments = getAssessmentsForProperty(pid)
    if (assessments.length > 0) {
      lines.push(`TAX: latest assessment $${assessments[0]?.marketValue?.toLocaleString() ?? '?'}`)
    }

    // Mortgage
    const mortgages = getMortgagesForProperty(pid)
    if (mortgages.length > 0) {
      lines.push(`MORTGAGES: ${mortgages.length} active`)
    }

    // YTD spend
    const ytd = getYTDSpend(pid)
    if (ytd > 0) {
      lines.push(`YTD MAINTENANCE SPEND: $${ytd.toLocaleString()}`)
    }

    // Upcoming expiries
    const expiries = getUpcomingExpiries(pid, 180)
    if (expiries.length > 0) {
      lines.push(`UPCOMING EXPIRIES (180 days): ${expiries.length} items`)
    }

    // Road events
    const roadEvents = getRoadEventsForProperty(pid)
    if (roadEvents.length > 0) {
      lines.push(`ROAD/ACCESS: ${roadEvents.length} events logged`)
    }

    return lines.join('\n')
  }

  /** Get the owner-provided narrative context for this property */
  getNarrative(): string {
    return getNarrativeText(this.propertyId)
  }

  searchRecords(query: string): SearchResult[] {
    const q = query.toLowerCase()
    const results: SearchResult[] = []

    for (const e of this.getEquipmentRecords()) {
      const text = [e.label, e.brand, e.model, e.location, e.categoryId].filter(Boolean).join(' ').toLowerCase()
      if (text.includes(q)) {
        results.push({
          recordType: 'equipment',
          id: e.id,
          label: e.label,
          summary: `${e.brand ?? ''} ${e.model ?? ''} — ${e.location ?? 'unknown location'}`.trim(),
          relatedFiles: this.buildRelatedFiles(e),
        })
      }
    }

    const tasks = getActiveTasks(this.propertyId)
    for (const t of tasks) {
      const text = [t.title, t.systemLabel, t.notes, t.contractor].filter(Boolean).join(' ').toLowerCase()
      if (text.includes(q)) {
        results.push({
          recordType: 'maintenance',
          id: t.id,
          label: t.title,
          summary: `[${t.status.toUpperCase()}] Due ${t.dueDate}, est $${t.estimatedCost ?? '?'}`,
          relatedFiles: [],
        })
      }
    }

    const capital = getCapitalItemsForProperty(this.propertyId)
    for (const c of capital) {
      const text = [c.title, c.notes].filter(Boolean).join(' ').toLowerCase()
      if (text.includes(q)) {
        results.push({
          recordType: 'capital',
          id: c.id,
          label: c.title,
          summary: `[${c.priority.toUpperCase()} ${c.estimatedYear}] $${c.costLow}–$${c.costHigh}`,
          relatedFiles: [],
        })
      }
    }

    for (const s of this.getServiceRecords()) {
      const text = [s.systemLabel, s.workDescription, s.contractor].filter(Boolean).join(' ').toLowerCase()
      if (text.includes(q)) {
        results.push({
          recordType: 'service',
          id: s.id,
          label: `${s.date} — ${s.systemLabel}`,
          summary: `${s.workDescription} (${s.contractor ?? 'unknown'}) $${s.totalCost ?? '?'}`,
          relatedFiles: [],
        })
      }
    }

    return results
  }

  async readFile(fileId: string): Promise<string> {
    if (!this.driveToken) {
      return '[Error: Not authenticated with Google Drive. Sign in to access file contents.]'
    }
    try {
      const result = await DriveClient.downloadFile(this.driveToken, fileId)
      return typeof result.content === 'string' ? result.content : '[Binary file — cannot display]'
    } catch (err) {
      return `[Error reading file: ${err instanceof Error ? err.message : String(err)}]`
    }
  }

  private buildRelatedFiles(equipment: EquipmentRecord): RelatedFile[] {
    const files: RelatedFile[] = []
    if (equipment.driveFileId) {
      files.push({
        fileId: equipment.driveFileId,
        name: `${equipment.label.toLowerCase().replace(/\s+/g, '_')}_record.md`,
        type: 'spec',
        description: `Equipment record and specifications for ${equipment.label}`,
      })
    }
    return files
  }
}
