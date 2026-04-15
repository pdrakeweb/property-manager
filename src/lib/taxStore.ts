import { makeSyncedStore } from './syncedStore'
import { formatTaxAssessment, taxAssessmentFilename, formatTaxPayment, taxPaymentFilename } from './domainMarkdown'
import type { TaxAssessment, TaxPayment } from '../schemas'

export const taxAssessmentStore = makeSyncedStore<TaxAssessment>(
  'pm_tax_assessments', 'tax_assessment', 'tax',
  formatTaxAssessment, taxAssessmentFilename,
)

export const taxPaymentStore = makeSyncedStore<TaxPayment>(
  'pm_tax_payments', 'tax_payment', 'tax',
  formatTaxPayment, taxPaymentFilename,
)

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
