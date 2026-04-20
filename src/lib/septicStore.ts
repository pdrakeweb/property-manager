import { makeSyncedStore } from './syncedStore'
import type { SepticEvent } from '../schemas'

export const septicStore = makeSyncedStore<SepticEvent>(
  'pm_septic_events', 'septic_event', 'septic_event',
)

export function getEventsForProperty(propertyId: string): SepticEvent[] {
  return septicStore.getAll()
    .filter(e => e.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
