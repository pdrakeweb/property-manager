import { makeSyncedStore } from './syncedStore'
import type { WellTest } from '../schemas'

export const wellTestStore = makeSyncedStore<WellTest>(
  'pm_well_tests', 'well_test', 'well_test',
)

export function getTestsForProperty(propertyId: string): WellTest[] {
  return wellTestStore.getAll()
    .filter(t => t.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
