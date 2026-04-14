import { makeStore } from './localStore'
import type { DocExpiry } from '../schemas'

const store = makeStore<DocExpiry & { id: string }>('pm_doc_expiry')
export const expiryStore = store

export function getUpcomingExpiries(propertyId: string, daysAhead = 180): (DocExpiry & { id: string })[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + daysAhead)
  return store.getAll()
    .filter(d => d.propertyId === propertyId && new Date(d.expiryDate) <= cutoff)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
}
