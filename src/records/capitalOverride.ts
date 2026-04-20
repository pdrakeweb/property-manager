import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const CapitalOverrideZ = z.object({
  id:              z.string(),  // same as capitalItemId
  status:          z.enum(['planned', 'in-progress', 'complete']),
  percentComplete: z.number().min(0).max(100),
})

export type CapitalOverrideRecord = z.infer<typeof CapitalOverrideZ>

export const capitalOverrideDef: RecordDefinition<typeof CapitalOverrideZ> = {
  type: 'capital_override',
  label: 'Capital Item Override',
  pluralLabel: 'Capital Item Overrides',
  folderName: 'Capital',
  allowMultiple: true,
  schema: CapitalOverrideZ,
  version: 1,
  title: (o) => `Capital override ${o.id}`,
  summary: (o) => `${o.status} · ${o.percentComplete}%`,
  fields: [
    { id: 'status',          label: 'Status',           kind: 'select', required: true,
      options: ['planned', 'in-progress', 'complete'] },
    { id: 'percentComplete', label: 'Percent Complete', kind: 'number', unit: '%' },
  ],
  ai: { expose: false },
}
