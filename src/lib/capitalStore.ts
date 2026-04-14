import { makeStore } from './localStore'
import type { CapitalTransaction, CapitalItemOverride } from '../types'

export const capitalTransactionStore = makeStore<CapitalTransaction>('pm_capital_txns')
export const capitalItemOverrideStore = makeStore<CapitalItemOverride>('pm_capital_overrides')

export function getTransactionsForItem(capitalItemId: string): CapitalTransaction[] {
  return capitalTransactionStore
    .getAll()
    .filter(t => t.capitalItemId === capitalItemId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function spentToDate(capitalItemId: string): number {
  return capitalTransactionStore
    .getAll()
    .filter(t => t.capitalItemId === capitalItemId)
    .reduce((s, t) => s + t.amount, 0)
}

export function getOverride(capitalItemId: string): CapitalItemOverride | undefined {
  return capitalItemOverrideStore.getAll().find(o => o.id === capitalItemId)
}

export function setOverride(capitalItemId: string, patch: Partial<Omit<CapitalItemOverride, 'id'>>) {
  const existing = getOverride(capitalItemId)
  if (existing) {
    capitalItemOverrideStore.update({ ...existing, ...patch })
  } else {
    capitalItemOverrideStore.add({
      id: capitalItemId,
      status: patch.status ?? 'planned',
      percentComplete: patch.percentComplete ?? 0,
    })
  }
}
