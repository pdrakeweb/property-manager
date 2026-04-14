import { makeStore } from './localStore'
import type { FuelDelivery } from '../schemas'
export const fuelStore = makeStore<FuelDelivery>('pm_fuel_deliveries')

export function getDeliveriesForProperty(propertyId: string): FuelDelivery[] {
  return fuelStore.getAll()
    .filter(d => d.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))
}
