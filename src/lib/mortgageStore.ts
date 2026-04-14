import { makeStore } from './localStore'
import type { Mortgage, MortgagePayment } from '../schemas'

export const mortgageStore        = makeStore<Mortgage>('pm_mortgages')
export const mortgagePaymentStore = makeStore<MortgagePayment>('pm_mortgage_payments')

export function getMortgagesForProperty(propertyId: string): Mortgage[] {
  return mortgageStore.getAll().filter(m => m.propertyId === propertyId)
}

export function getPaymentsForMortgage(mortgageId: string): MortgagePayment[] {
  return mortgagePaymentStore.getAll()
    .filter(p => p.mortgageId === mortgageId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface AmortizationRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

/** Generate a standard amortization schedule */
export function buildAmortizationSchedule(
  balance: number,
  annualRate: number,
  termMonths: number,
  monthlyPayment: number,
): AmortizationRow[] {
  const monthlyRate = annualRate / 100 / 12
  const rows: AmortizationRow[] = []
  let remaining = balance

  for (let i = 1; i <= termMonths && remaining > 0.01; i++) {
    const interest  = remaining * monthlyRate
    const principal = Math.min(monthlyPayment - interest, remaining)
    remaining      -= principal
    rows.push({
      month:     i,
      payment:   monthlyPayment,
      principal: Math.round(principal * 100) / 100,
      interest:  Math.round(interest * 100) / 100,
      balance:   Math.max(0, Math.round(remaining * 100) / 100),
    })
  }
  return rows
}

export interface ExtraPaymentSimResult {
  originalPayoffMonths: number
  newPayoffMonths: number
  monthsSaved: number
  interestSaved: number
}

export function simulateExtraPayment(
  balance: number,
  annualRate: number,
  termMonths: number,
  monthlyPayment: number,
  extraPerMonth: number,
): ExtraPaymentSimResult {
  const monthlyRate = annualRate / 100 / 12

  function payoffMonths(extra: number): { months: number; totalInterest: number } {
    let remaining = balance
    let months = 0
    let totalInterest = 0
    while (remaining > 0.01 && months < termMonths * 2) {
      const interest  = remaining * monthlyRate
      const principal = Math.min(monthlyPayment + extra - interest, remaining)
      remaining      -= principal
      totalInterest  += interest
      months++
    }
    return { months, totalInterest }
  }

  const orig = payoffMonths(0)
  const sim  = payoffMonths(extraPerMonth)

  return {
    originalPayoffMonths: orig.months,
    newPayoffMonths:      sim.months,
    monthsSaved:          orig.months - sim.months,
    interestSaved:        Math.round((orig.totalInterest - sim.totalInterest) * 100) / 100,
  }
}

/** Sum of current balances for a property (for equity card) */
export function getTotalMortgageBalance(propertyId: string): number {
  return getMortgagesForProperty(propertyId)
    .reduce((sum, m) => sum + m.currentBalance, 0)
}
