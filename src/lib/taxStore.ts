import { makeStore } from './localStore'
import type { TaxAssessment, TaxPayment } from '../schemas'

export const taxAssessmentStore = makeStore<TaxAssessment>('pm_tax_assessments')
export const taxPaymentStore    = makeStore<TaxPayment>('pm_tax_payments')

export function getAssessmentsForProperty(propertyId: string): TaxAssessment[] {
  return taxAssessmentStore.getAll().filter(a => a.propertyId === propertyId)
    .sort((a, b) => b.year - a.year)
}

export function getPaymentsForProperty(propertyId: string): TaxPayment[] {
  return taxPaymentStore.getAll().filter(p => p.propertyId === propertyId)
    .sort((a, b) => b.year - a.year || a.installment - b.installment)
}

export function getNextTaxPayment(propertyId: string): TaxPayment | undefined {
  const today = new Date().toISOString().slice(0, 10)
  return taxPaymentStore.getAll()
    .filter(p => p.propertyId === propertyId && !p.paidDate && p.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
}

export function getOverdueTaxPayments(propertyId: string): TaxPayment[] {
  const today = new Date().toISOString().slice(0, 10)
  return taxPaymentStore.getAll()
    .filter(p => p.propertyId === propertyId && !p.paidDate && p.dueDate < today)
}
