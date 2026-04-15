import { makeSyncedStore } from './syncedStore'
import { formatCompletedEvent, completedEventFilename } from './domainMarkdown'
import type { CompletedEvent } from '../schemas'

export const costStore = makeSyncedStore<CompletedEvent>(
  'pm_completed_events', 'completed_event', 'completed_event',
  formatCompletedEvent, completedEventFilename,
)

export function getYTDSpend(propertyId: string, year = new Date().getFullYear()): number {
  return costStore.getAll()
    .filter(e => e.propertyId === propertyId && e.completionDate.startsWith(String(year)) && e.cost)
    .reduce((s, e) => s + (e.cost ?? 0), 0)
}

export function getCostsByCategory(propertyId: string, year = new Date().getFullYear()): Record<string, number> {
  const result: Record<string, number> = {}
  for (const e of costStore.getAll()) {
    if (e.propertyId !== propertyId) continue
    if (!e.completionDate.startsWith(String(year))) continue
    if (!e.cost) continue
    result[e.categoryId] = (result[e.categoryId] ?? 0) + e.cost
  }
  return result
}
