/**
 * Builds a condensed property context string for the AI system prompt.
 * Designed to be information-dense but token-efficient.
 */

import { PropertyRecordsAPI } from './PropertyRecordsAPI'

export async function buildPropertyContext(propertyId: string, driveToken?: string | null): Promise<string> {
  const api = new PropertyRecordsAPI(propertyId, driveToken)
  const prop = api.getProperty()
  if (!prop) return 'No property data available.'

  const lines: string[] = []

  // ── Property overview ────────────────────────────────────────────────────
  lines.push(`PROPERTY: ${prop.name} (${prop.type}), ${prop.address}`)
  lines.push(`Documentation: ${prop.stats.documented}/${prop.stats.total} systems documented`)
  if (prop.driveRootFolderId) {
    lines.push(`Drive root folder: ${prop.driveRootFolderId}`)
  }
  lines.push('')

  // ── Narrative (owner-provided context) ──────────────────────────────────
  const narrative = api.getNarrative()
  if (narrative) {
    lines.push(narrative)
    lines.push('')
  }

  // ── Equipment ────────────────────────────────────────────────────────────
  const equipment = api.getEquipment()
  if (Array.isArray(equipment) && equipment.length > 0) {
    lines.push(`EQUIPMENT (${equipment.length} documented):`)
    for (const e of equipment) {
      const parts = [`- ${e.label}`]
      if (e.brand || e.model) parts.push(`(${[e.brand, e.model].filter(Boolean).join(' ')})`)
      if (e.installYear) parts.push(`installed ${e.installYear}`)
      if (e.age) parts.push(`${e.age}yr old`)
      if (e.serialNumber) parts.push(`S/N ${e.serialNumber}`)
      if (e.location) parts.push(`@ ${e.location}`)
      if (e.lastServiceDate) parts.push(`last svc ${e.lastServiceDate}`)
      if (e.relatedFiles.length > 0) {
        parts.push(`[${e.relatedFiles.length} files available]`)
      }
      lines.push(parts.join(', '))
    }
    lines.push('')
  }

  // ── Maintenance ──────────────────────────────────────────────────────────
  const tasks = api.getMaintenanceTasks()
  if (tasks.length > 0) {
    const overdue = tasks.filter(t => t.status === 'overdue').length
    const due = tasks.filter(t => t.status === 'due').length
    lines.push(`MAINTENANCE (${tasks.length} tasks, ${overdue} overdue, ${due} due soon):`)
    for (const t of tasks.slice(0, 8)) {
      const parts = [`- [${t.status.toUpperCase()}] ${t.title}`]
      parts.push(`due ${t.dueDate}`)
      if (t.estimatedCost != null) parts.push(`est $${t.estimatedCost}`)
      if (t.contractor) parts.push(t.contractor)
      if (t.recurrence) parts.push(`(${t.recurrence})`)
      lines.push(parts.join(', '))
    }
    if (tasks.length > 8) lines.push(`  ... and ${tasks.length - 8} more tasks`)
    lines.push('')
  }

  // ── Capital forecast ─────────────────────────────────────────────────────
  const capital = api.getCapitalForecast()
  if (capital.length > 0) {
    lines.push(`CAPITAL FORECAST (${capital.length} items):`)
    for (const c of capital) {
      const parts = [`- [${c.priority.toUpperCase()} ${c.estimatedYear}] ${c.title}`]
      parts.push(`$${c.costLow.toLocaleString()}–$${c.costHigh.toLocaleString()}`)
      if (c.notes) parts.push(`— ${c.notes.slice(0, 80)}`)
      lines.push(parts.join(', '))
    }
    lines.push('')
  }

  // ── Service history ──────────────────────────────────────────────────────
  const services = api.getServiceHistory()
  if (services.length > 0) {
    lines.push(`RECENT SERVICE (${services.length} records):`)
    for (const s of services.slice(0, 6)) {
      lines.push(`- ${s.date}: ${s.systemLabel} — ${s.workDescription} (${s.contractor ?? '?'}) $${s.totalCost ?? '?'}`)
    }
    if (services.length > 6) lines.push(`  ... and ${services.length - 6} more records`)
    lines.push('')
  }

  // ── HA status ────────────────────────────────────────────────────────────
  const ha = await api.getHAStatus()
  if (ha.length > 0) {
    lines.push('HOME ASSISTANT LIVE STATUS:')
    for (const sensor of ha) {
      const warn = sensor.status === 'warning' || sensor.status === 'alert' ? ` [${sensor.status.toUpperCase()}]` : ''
      lines.push(`- ${sensor.label}: ${sensor.value}${sensor.unit ? sensor.unit : ''}${warn}`)
    }
    lines.push('')
  }

  // ── Extended store data (insurance, permits, fuel, tax, etc.) ────────────
  const extended = api.getExtendedContext()
  if (extended) {
    lines.push(extended)
    lines.push('')
  }

  // ── Available categories ─────────────────────────────────────────────────
  const categories = api.getCategories()
  lines.push(`SYSTEM CATEGORIES: ${categories.map(c => c.label).join(', ')}`)

  return lines.join('\n')
}
