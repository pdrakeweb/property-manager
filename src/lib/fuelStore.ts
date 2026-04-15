import { makeSyncedStore } from './syncedStore'
import { formatFuelDelivery, fuelDeliveryFilename } from './domainMarkdown'
import type { FuelDelivery } from '../schemas'

export const fuelStore = makeSyncedStore<FuelDelivery>(
  'pm_fuel_deliveries', 'fuel_delivery', 'fuel_delivery',
  formatFuelDelivery, fuelDeliveryFilename,
)

export function getDeliveriesForProperty(propertyId: string): FuelDelivery[] {
  return fuelStore.getAll()
    .filter(d => d.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
