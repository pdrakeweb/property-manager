import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const UtilityBillZ = z.object({
  id:          z.string(),
  accountId:   z.string(),
  propertyId:  z.string(),
  periodStart: z.string(),
  periodEnd:   z.string(),
  consumption: z.number().optional(),
  unit:        z.string().optional(),
  totalCost:   z.number(),
  ratePerUnit: z.number().optional(),
  driveFileId: z.string().optional(),
  notes:       z.string().optional(),
})

export type UtilityBillRecord = z.infer<typeof UtilityBillZ>

export const utilityBillDef: RecordDefinition<typeof UtilityBillZ> = {
  type: 'utility_bill',
  label: 'Utility Bill',
  pluralLabel: 'Utility Bills',
  folderName: 'Utilities',
  allowMultiple: true,
  schema: UtilityBillZ,
  version: 1,
  title: (b) => `Utility Bill ${b.periodStart}`,
  summary: (b) => `$${b.totalCost.toLocaleString()}${b.consumption ? ` · ${b.consumption}${b.unit ?? ''}` : ''}`,
  filename: (b) => `utility_bill_${b.periodStart}_${b.id.slice(0, 8)}.md`,
  fields: [
    { id: 'periodStart', label: 'Period Start', kind: 'date', required: true },
    { id: 'periodEnd',   label: 'Period End',   kind: 'date', required: true },
    { id: 'consumption', label: 'Consumption',  kind: 'number' },
    { id: 'unit',        label: 'Unit',         kind: 'text', placeholder: 'kWh, CCF, gal…' },
    { id: 'totalCost',   label: 'Total Cost',   kind: 'currency', required: true },
    { id: 'ratePerUnit', label: 'Rate/Unit',    kind: 'currency' },
    { id: 'notes',       label: 'Notes',        kind: 'textarea' },
    { id: 'accountId',   label: 'Account',      kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'propertyId',  label: 'Property',     kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'driveFileId', label: 'Drive File',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_utility_bills',
    description: 'Monthly utility bills with consumption and cost.',
    searchable: ['notes'],
  },
}
