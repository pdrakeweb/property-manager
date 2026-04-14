import { makeStore } from './localStore'
import type { SepticEvent } from '../schemas'
export const septicStore = makeStore<SepticEvent>('pm_septic_events')

export function getEventsForProperty(propertyId: string): SepticEvent[] {
  return septicStore.getAll()
    .filter(e => e.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
