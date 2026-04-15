import { makeSyncedStore } from './syncedStore'
import { formatSepticEvent, septicEventFilename } from './domainMarkdown'
import type { SepticEvent } from '../schemas'

export const septicStore = makeSyncedStore<SepticEvent>(
  'pm_septic_events', 'septic_event', 'septic_event',
  formatSepticEvent, septicEventFilename,
)

export function getEventsForProperty(propertyId: string): SepticEvent[] {
  return septicStore.getAll()
    .filter(e => e.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
