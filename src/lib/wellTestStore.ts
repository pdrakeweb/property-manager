import { makeStore } from './localStore'
import type { WellTest } from '../schemas'
export const wellTestStore = makeStore<WellTest>('pm_well_tests')

export function getTestsForProperty(propertyId: string): WellTest[] {
  return wellTestStore.getAll()
    .filter(t => t.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
