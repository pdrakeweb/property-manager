import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const MortgagePaymentZ = z.object({
  id:             z.string(),
  mortgageId:     z.string(),
  propertyId:     z.string(),
  date:           z.string(),
  amount:         z.number(),
  principal:      z.number(),
  interest:       z.number(),
  escrow:         z.number().optional(),
  extraPrincipal: z.number().optional(),
  notes:          z.string().optional(),
})

export type MortgagePaymentRecord = z.infer<typeof MortgagePaymentZ>

export const mortgagePaymentDef: RecordDefinition<typeof MortgagePaymentZ> = {
  type: 'mortgage_payment',
  label: 'Mortgage Payment',
  pluralLabel: 'Mortgage Payments',
  folderName: 'Mortgage',
  allowMultiple: true,
  schema: MortgagePaymentZ,
  version: 1,
  title: (p) => `Mortgage Payment — ${p.date}`,
  summary: (p) => `$${p.amount.toLocaleString()} (P $${p.principal} / I $${p.interest})`,
  filename: (p) => `mortgage_payment_${p.date}_${p.id.slice(0, 8)}.md`,
  fields: [
    { id: 'date',           label: 'Date',            kind: 'date',     required: true },
    { id: 'amount',         label: 'Amount',          kind: 'currency', required: true },
    { id: 'principal',      label: 'Principal',       kind: 'currency', required: true },
    { id: 'interest',       label: 'Interest',        kind: 'currency', required: true },
    { id: 'escrow',         label: 'Escrow',          kind: 'currency' },
    { id: 'extraPrincipal', label: 'Extra Principal', kind: 'currency' },
    { id: 'notes',          label: 'Notes',           kind: 'textarea' },
    { id: 'mortgageId',     label: 'Mortgage',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'propertyId',     label: 'Property',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_mortgage_payments',
    description: 'Individual mortgage payment history with principal/interest split.',
    searchable: ['notes'],
  },
}
