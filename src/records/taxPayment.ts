import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const TaxPaymentZ = z.object({
  id:          z.string(),
  propertyId:  z.string(),
  year:        z.number(),
  installment: z.union([z.literal(1), z.literal(2)]),
  dueDate:     z.string(),
  paidDate:    z.string().optional(),
  amount:      z.number(),
  penalty:     z.number().optional(),
  notes:       z.string().optional(),
})

export type TaxPaymentRecord = z.infer<typeof TaxPaymentZ>

export const taxPaymentDef: RecordDefinition<typeof TaxPaymentZ> = {
  type: 'tax_payment',
  label: 'Tax Payment',
  pluralLabel: 'Tax Payments',
  folderName: 'Tax Records',
  allowMultiple: true,
  schema: TaxPaymentZ,
  version: 1,
  title: (p) => `Tax Payment — ${p.year} #${p.installment}`,
  summary: (p) => `$${p.amount.toLocaleString()} due ${p.dueDate}`,
  filename: (p) => `tax_payment_${p.year}_inst${p.installment}_${p.id.slice(0, 8)}.md`,
  fields: [
    { id: 'year',        label: 'Year',        kind: 'number', required: true },
    { id: 'installment', label: 'Installment', kind: 'select', required: true,
      options: ['1', '2'] },
    { id: 'dueDate',     label: 'Due Date',    kind: 'date', required: true },
    { id: 'paidDate',    label: 'Paid Date',   kind: 'date' },
    { id: 'amount',      label: 'Amount',      kind: 'currency', required: true },
    { id: 'penalty',     label: 'Penalty',     kind: 'currency' },
    { id: 'notes',       label: 'Notes',       kind: 'textarea' },
    { id: 'propertyId',  label: 'Property',    kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_tax_payments',
    description: 'Property-tax installment payments with due dates and amounts.',
    searchable: ['notes'],
  },
}
