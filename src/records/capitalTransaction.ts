import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const CapitalTransactionZ = z.object({
  id:            z.string(),
  capitalItemId: z.string(),
  date:          z.string(),
  amount:        z.number(),
  vendorId:      z.string().optional(),
  invoiceRef:    z.string().optional(),
  notes:         z.string().optional(),
})

export type CapitalTransactionRecord = z.infer<typeof CapitalTransactionZ>

export const capitalTransactionDef: RecordDefinition<typeof CapitalTransactionZ> = {
  type: 'capital_transaction',
  label: 'Capital Transaction',
  pluralLabel: 'Capital Transactions',
  folderName: 'Capital',
  allowMultiple: true,
  schema: CapitalTransactionZ,
  version: 1,
  title: (t) => `Capital ${t.date} — $${t.amount.toLocaleString()}`,
  filename: (t) => `capital_txn_${t.date}_${t.id.slice(0, 8)}.md`,
  fields: [
    { id: 'date',          label: 'Date',          kind: 'date',     required: true },
    { id: 'amount',        label: 'Amount',        kind: 'currency', required: true },
    { id: 'capitalItemId', label: 'Capital Item',  kind: 'text' },
    { id: 'invoiceRef',    label: 'Invoice',       kind: 'text' },
    { id: 'notes',         label: 'Notes',         kind: 'textarea' },
    { id: 'vendorId',      label: 'Vendor',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_capital_transactions',
    description: 'Expenditures logged against capital replacement items.',
    searchable: ['capitalItemId', 'invoiceRef', 'notes'],
  },
}
