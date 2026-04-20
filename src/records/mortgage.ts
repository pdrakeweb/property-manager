import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const MortgageZ = z.object({
  id:              z.string(),
  propertyId:      z.string(),
  label:           z.string(),
  lender:          z.string(),
  accountNumber:   z.string().optional(),
  originalBalance: z.number(),
  currentBalance:  z.number(),
  interestRate:    z.number(),
  termMonths:      z.number(),
  startDate:       z.string(),
  monthlyPayment:  z.number(),
  escrowAmount:    z.number().optional(),
  notes:           z.string().optional(),
})

export type MortgageRecord = z.infer<typeof MortgageZ>

export const mortgageDef: RecordDefinition<typeof MortgageZ> = {
  type: 'mortgage',
  label: 'Mortgage',
  pluralLabel: 'Mortgages',
  folderName: 'Mortgage',
  allowMultiple: true,
  schema: MortgageZ,
  version: 1,
  title: (m) => `Mortgage: ${m.label}`,
  summary: (m) => `${m.lender} · $${m.currentBalance.toLocaleString()} @ ${m.interestRate}%`,
  filename: (m) => {
    const safe = m.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    return `mortgage_${safe}_${m.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'label',           label: 'Label',           kind: 'text', required: true,
      placeholder: 'Primary, HELOC…' },
    { id: 'lender',          label: 'Lender',          kind: 'text', required: true },
    { id: 'accountNumber',   label: 'Account #',       kind: 'text' },
    { id: 'originalBalance', label: 'Original Balance', kind: 'currency', required: true },
    { id: 'currentBalance',  label: 'Current Balance',  kind: 'currency', required: true },
    { id: 'interestRate',    label: 'Interest Rate',   kind: 'number', unit: '%' },
    { id: 'termMonths',      label: 'Term',            kind: 'number', unit: 'months' },
    { id: 'startDate',       label: 'Start Date',      kind: 'date', required: true },
    { id: 'monthlyPayment',  label: 'Monthly Payment', kind: 'currency', required: true },
    { id: 'escrowAmount',    label: 'Escrow',          kind: 'currency' },
    { id: 'notes',           label: 'Notes',           kind: 'textarea' },
    { id: 'propertyId',      label: 'Property',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_mortgages',
    description: 'Mortgage and HELOC accounts attached to the property.',
    searchable: ['label', 'lender', 'notes'],
  },
}
