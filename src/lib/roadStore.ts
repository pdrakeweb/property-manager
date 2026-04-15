import { makeSyncedStore } from './syncedStore'
import { formatRoadEvent, roadEventFilename } from './domainMarkdown'
import type { RoadEvent } from '../types/road'

export const roadStore = makeSyncedStore<RoadEvent>(
  'pm_road_events', 'road', 'road',
  formatRoadEvent, roadEventFilename,
)

export function getRoadEventsForProperty(propertyId: string): RoadEvent[] {
  return roadStore
    .getAll()
    .filter(e => e.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getRoadSpendByYear(propertyId: string): Record<number, number> {
  const result: Record<number, number> = {}
  for (const e of getRoadEventsForProperty(propertyId)) {
    if (e.cost == null) continue
    const year = parseInt(e.date.slice(0, 4), 10)
    result[year] = (result[year] ?? 0) + e.cost
  }
  return result
}

export function getGravelTonsByYear(propertyId: string): Record<number, number> {
  const result: Record<number, number> = {}
  for (const e of getRoadEventsForProperty(propertyId)) {
    if (e.maintenanceTypeId !== 'gravel_delivery') continue
    if (e.quantity == null) continue
    const year = parseInt(e.date.slice(0, 4), 10)
    result[year] = (result[year] ?? 0) + e.quantity
  }
  return result
}
