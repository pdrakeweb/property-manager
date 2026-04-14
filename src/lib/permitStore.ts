import { makeStore } from './localStore'
import type { Permit } from '../types/permits'

export const permitStore = makeStore<Permit>('pm_permits')

export function getPermitsForProperty(propertyId: string): Permit[] {
  return permitStore.getAll().filter(p => p.propertyId === propertyId)
}

export function getExpiringPermits(
  propertyId: string,
  withinDays = 30,
): Permit[] {
  const today  = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() + withinDays * 86_400_000).toISOString().slice(0, 10)
  return getPermitsForProperty(propertyId).filter(
    p =>
      p.expiryDate !== undefined &&
      p.status !== 'expired' &&
      p.status !== 'rejected' &&
      p.expiryDate >= today &&
      p.expiryDate <= cutoff,
  )
}

export function getOpenPermits(propertyId: string): Permit[] {
  return getPermitsForProperty(propertyId).filter(
    p => p.status === 'open' || p.status === 'pending_inspection',
  )
}
