import { makeSyncedStore } from './syncedStore'
import type { InsurancePolicy } from '../types/insurance'

export const insuranceStore = makeSyncedStore<InsurancePolicy>(
  'pm_insurance_policies', 'insurance', 'insurance',
)

export function getPoliciesForProperty(propertyId: string): InsurancePolicy[] {
  return insuranceStore.getAll().filter(p => p.propertyId === propertyId)
}

export function getExpiringPolicies(
  propertyId: string,
  withinDays = 60,
): InsurancePolicy[] {
  const today  = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() + withinDays * 86_400_000).toISOString().slice(0, 10)
  return getPoliciesForProperty(propertyId).filter(
    p => p.status === 'active' && p.renewalDate >= today && p.renewalDate <= cutoff,
  )
}

export function getExpiredPolicies(propertyId: string): InsurancePolicy[] {
  const today = new Date().toISOString().slice(0, 10)
  return getPoliciesForProperty(propertyId).filter(
    p => p.status !== 'cancelled' && p.renewalDate < today,
  )
}
