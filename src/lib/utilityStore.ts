import { makeStore } from './localStore'
import type { UtilityAccount, UtilityBill, UtilityType } from '../schemas'

export const utilityAccountStore = makeStore<UtilityAccount>('pm_utility_accounts')
export const utilityBillStore    = makeStore<UtilityBill>('pm_utility_bills')

export function getAccountsForProperty(propertyId: string): UtilityAccount[] {
  return utilityAccountStore.getAll().filter(a => a.propertyId === propertyId)
}

export function getBillsForAccount(accountId: string): UtilityBill[] {
  return utilityBillStore.getAll()
    .filter(b => b.accountId === accountId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
}

export function getBillsForProperty(propertyId: string): UtilityBill[] {
  return utilityBillStore.getAll()
    .filter(b => b.propertyId === propertyId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
}

export const UTILITY_LABELS: Record<UtilityType, string> = {
  electric: 'Electric',
  gas:      'Natural Gas',
  water:    'Water',
  sewer:    'Sewer',
  trash:    'Trash',
  internet: 'Internet',
  phone:    'Phone',
  other:    'Other',
}

export const UTILITY_COLORS: Record<UtilityType, string> = {
  electric: 'bg-amber-500',
  gas:      'bg-sky-500',
  water:    'bg-blue-500',
  sewer:    'bg-teal-500',
  trash:    'bg-slate-500',
  internet: 'bg-violet-500',
  phone:    'bg-emerald-500',
  other:    'bg-rose-500',
}

export const UTILITY_BADGE: Record<UtilityType, string> = {
  electric: 'bg-amber-50 text-amber-700 border-amber-100',
  gas:      'bg-sky-50 text-sky-700 border-sky-100',
  water:    'bg-blue-50 text-blue-700 border-blue-100',
  sewer:    'bg-teal-50 text-teal-700 border-teal-100',
  trash:    'bg-slate-50 text-slate-700 border-slate-200',
  internet: 'bg-violet-50 text-violet-700 border-violet-100',
  phone:    'bg-emerald-50 text-emerald-700 border-emerald-100',
  other:    'bg-rose-50 text-rose-700 border-rose-100',
}

/** Monthly spend rolled up across all accounts for a property */
export function getMonthlySpend(propertyId: string): { month: string; cost: number }[] {
  const bills = getBillsForProperty(propertyId)
  const byMonth: Record<string, number> = {}
  for (const b of bills) {
    const month = b.periodStart.slice(0, 7) // YYYY-MM
    byMonth[month] = (byMonth[month] ?? 0) + b.totalCost
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cost]) => ({ month, cost }))
}
