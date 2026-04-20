// Task → expected calendar event dates.
// Replaces seasonDates.ts with a cleaner, spec-aligned API.

import type { IndexRecord } from './localIndex'

const SEASON_DATES: Record<string, string> = {
  spring: '-03-20',
  summer: '-06-20',
  fall:   '-09-22',
  winter: '-12-21',
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

/** Advance a base date by the task's recurrence period until it's ≥ today. */
function nextOccurrence(baseDate: string, recurrence: string): string {
  let current = baseDate
  const t = today()
  let iterations = 0
  while (current < t && iterations < 365) {
    iterations++
    switch (recurrence.toLowerCase()) {
      case 'weekly':      current = addDays(current, 7);   break
      case 'monthly':     current = addMonths(current, 1); break
      case 'quarterly':
      case 'every 90 days': current = addDays(current, 91); break
      case 'semi-annual': current = addDays(current, 182); break
      case 'annually':    current = addDays(current, 365); break
      default:            return current  // unknown recurrence — don't advance
    }
  }
  return current
}

/**
 * Expand a task into the list of upcoming event dates (up to 12 months out).
 * Returns ISO date strings. Empty array if the task has no due date.
 */
export function expandTaskToDates(task: IndexRecord): string[] {
  const data = task.data as Record<string, unknown>
  const dueDate  = (data['dueDate']   as string | undefined) ?? ''
  const recurrence = (data['recurrence'] as string | undefined) ?? ''
  const status   = (data['status']    as string | undefined) ?? ''

  if (!dueDate || status === 'completed') return []

  // Check if it's a seasonal date (e.g., "spring", "summer-2026")
  const seasonMatch = dueDate.toLowerCase().match(/^(spring|summer|fall|winter)(?:-(\d{4}))?$/)
  if (seasonMatch) {
    const season = seasonMatch[1]
    const suffix = SEASON_DATES[season]
    if (!suffix) return []
    const t = today()
    const year = new Date().getFullYear()
    let date = `${year}${suffix}`
    // If this year's date has passed, use next year
    if (date < t) date = `${year + 1}${suffix}`
    return [date]
  }

  if (!recurrence) {
    // One-time task
    return dueDate >= today() ? [dueDate] : []
  }

  // Recurring: expand up to 12 months from today
  const t = today()
  const windowEnd = addMonths(t, 12)
  const first = nextOccurrence(dueDate, recurrence)
  if (first > windowEnd) return []

  const dates: string[] = [first]
  let current = first
  let iterations = 0

  while (iterations < 50) {
    iterations++
    let next: string
    switch (recurrence.toLowerCase()) {
      case 'weekly':        next = addDays(current, 7);    break
      case 'monthly':       next = addMonths(current, 1);  break
      case 'quarterly':
      case 'every 90 days': next = addDays(current, 91);   break
      case 'semi-annual':   next = addDays(current, 182);  break
      case 'annually':      next = addDays(current, 365);  break
      default:              return dates
    }
    if (next > windowEnd) break
    dates.push(next)
    current = next
  }

  return dates
}

/**
 * Build the Google Calendar event description for a task.
 * The [PM:taskId=...] tag is the machine-readable anchor for reconciliation.
 */
export function buildEventDescription(task: IndexRecord, propertyName: string): string {
  const data = task.data as Record<string, unknown>
  const lines: string[] = [
    `Property: ${propertyName}`,
    `Category: ${String(data['systemLabel'] ?? data['categoryId'] ?? '')}`,
    `Due: ${String(data['dueDate'] ?? '')}`,
  ]
  if (data['estimatedCost'] !== undefined) {
    lines.push(`Est. cost: $${Number(data['estimatedCost']).toLocaleString()}`)
  }
  if (data['notes']) {
    lines.push(`Notes: ${String(data['notes'])}`)
  }
  lines.push('')
  lines.push(`[PM:taskId=${task.id}] [PM:propertyId=${task.propertyId}]`)
  return lines.join('\n')
}

/** Extract the taskId from an event description written by buildEventDescription. */
export function parseTaskIdFromDescription(description: string): string | null {
  const m = description.match(/\[PM:taskId=([^\]]+)\]/)
  return m ? m[1] : null
}
