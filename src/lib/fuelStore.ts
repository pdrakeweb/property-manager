import { makeSyncedStore } from './syncedStore'
import type { FuelDelivery } from '../schemas'

export const fuelStore = makeSyncedStore<FuelDelivery>(
  'pm_fuel_deliveries', 'fuel_delivery', 'fuel_delivery',
)

export function getDeliveriesForProperty(propertyId: string): FuelDelivery[] {
  return fuelStore.getAll()
    .filter(d => d.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
