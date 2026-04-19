/**
 * Property Records API — provides structured access to property data.
 *
 * The AI interacts with this service rather than raw stores directly.
 * All reads go through user-editable stores (propertyStore, capitalItemStore,
 * localIndex equipment records, costStore completed events, live HA client).
 */

import { CATEGORIES } from '../data/mockData'
import { getPropertyById } from '../lib/propertyStore'
import { getCapitalItemsForProperty } from '../lib/capitalItemStore'
import { getActiveTasks } from '../lib/maintenanceStore'
import { localIndex } from '../lib/localIndex'
import { costStore } from '../lib/costStore'
import { listEntities, getHAConfig } from '../lib/haClient'
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
  ServiceRecord, HAStatus, Category, HAEntityState,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * localIndex stores equipment as a record with `data.values` holding the form
 * fields. Project it back to the richer EquipmentRecord shape the AI/UI expect.
 */
function indexRecordToEquipment(r: import('../lib/localIndex').IndexRecord): EquipmentRecord {
  const data   = (r.data ?? {}) as Record<string, unknown>
  const values = ((data['values'] ?? {}) as Record<string, unknown>)

  const pick = (k: string): string | undefined => {
    const v = values[k]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  }
  const num = (k: string): number | undefined => {
    const v = values[k]
    if (typeof v === 'number') return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }

  const installYear = num('install_year') ?? num('installYear')
  const currentYear = new Date().getFullYear()
  const age         = installYear ? Math.max(0, currentYear - installYear) : undefined

  const uploadStatus: EquipmentRecord['uploadStatus'] =
    r.syncState === 'synced'          ? 'uploaded'
    : r.syncState === 'pending_upload' ? 'pending'
    : r.syncState === 'conflict'       ? 'error'
    : 'draft'

  return {
    id:            r.id,
    propertyId:    r.propertyId,
    categoryId:    r.categoryId ?? String(data['categoryId'] ?? ''),
    label:         r.title,
    brand:         pick('brand'),
    model:         pick('model') ?? pick('model_number'),
    serialNumber:  pick('serial_number') ?? pick('serialNumber'),
    installYear,
    age,
    location:      pick('location'),
    lastServiceDate: pick('last_service_date') ?? pick('lastServiceDate'),
    uploadStatus,
    hasPhotos:     Array.isArray(values['photos']) && (values['photos'] as unknown[]).length > 0,
    ...(r.driveFileId ? { driveFileId: r.driveFileId } : {}),
  }
}

function haEntityToStatus(e: HAEntityState): HAStatus {
  const attrs = e.attributes ?? {}
  const friendly = typeof attrs.friendly_name === 'string' ? attrs.friendly_name : e.entity_id
  const unit     = typeof attrs.unit_of_measurement === 'string' ? attrs.unit_of_measurement : undefined
  const value    = String(e.state)

  let status: HAStatus['status'] = 'ok'
  const lower = value.toLowerCase()
  if (lower === 'unavailable' || lower === 'unknown') status = 'unknown'
  else if (lower === 'off' || lower === 'closed')     status = 'off'
  else if (lower === 'on' || lower === 'open' || lower === 'home' || lower === 'detected') status = 'ok'

  return {
    entityId: e.entity_id,
    label:    friendly,
    value,
    ...(unit ? { unit } : {}),
    status,
  }
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
    return getPropertyById(this.propertyId)
  }

  getEquipment(id?: string): EquipmentWithFiles | EquipmentWithFiles[] {
    const records = localIndex.getAll('equipment', this.propertyId).map(indexRecordToEquipment)

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

  /**
   * Service history derived from completed maintenance events in costStore.
   * Each CompletedEvent represents a finished task with cost/contractor info.
   */
  getServiceHistory(filter?: {
    systemLabel?: string
    afterDate?: string
    beforeDate?: string
  }): ServiceRecord[] {
    let records: ServiceRecord[] = costStore.getAll()
      .filter(e => e.propertyId === this.propertyId)
      .map(e => ({
        id:              e.id,
        propertyId:      e.propertyId,
        date:            e.completionDate,
        systemLabel:     e.taskTitle || e.categoryId,
        workDescription: e.notes ? `${e.taskTitle} — ${e.notes}` : e.taskTitle,
        ...(e.contractor  ? { contractor: e.contractor } : {}),
        ...(e.cost != null ? { totalCost: e.cost }       : {}),
      }))

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
   * Fetch live Home Assistant sensor states linked to this property's equipment.
   * Returns [] when HA is not configured — no mock fallback.
   */
  async getHAStatus(): Promise<HAStatus[]> {
    const { url, token } = getHAConfig()
    if (!url || !token) return []

    // Entity IDs linked to equipment at this property
    const linkedIds = localIndex.getAll('equipment', this.propertyId)
      .map(r => {
        const data = r.data as Record<string, unknown>
        const values = (data['values'] ?? {}) as Record<string, unknown>
        const v = values['ha_entity_id']
        return typeof v === 'string' && v.trim() ? v.trim() : null
      })
      .filter((v): v is string => v !== null)

    if (linkedIds.length === 0) return []

    try {
      const all = await listEntities()
      const byId = new Map(all.map(e => [e.entity_id, e]))
      return linkedIds
        .map(id => byId.get(id))
        .filter((e): e is HAEntityState => e !== undefined)
        .map(haEntityToStatus)
    } catch {
      return []
    }
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

    const equipment = localIndex.getAll('equipment', this.propertyId).map(indexRecordToEquipment)
    for (const e of equipment) {
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

    const services = this.getServiceHistory()
    for (const s of services) {
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
      const { DriveClient } = await import('../lib/driveClient')
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
