import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const CapitalItemZ = z.object({
  id:             z.string(),
  propertyId:     z.string(),
  title:          z.string(),
  categoryId:     z.string(),
  installYear:    z.number().optional(),
  ageYears:       z.number().optional(),
  priority:       z.enum(['critical', 'high', 'medium', 'low']),
  estimatedYear:  z.number(),
  costLow:        z.number(),
  costHigh:       z.number(),
  notes:          z.string().optional(),
  source:         z.enum(['manual', 'ai-suggested', 'age-based']),
  status:         z.enum(['planned', 'in-progress', 'complete']).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
})

export type CapitalItemRecord = z.infer<typeof CapitalItemZ>

export const capitalItemDef: RecordDefinition<typeof CapitalItemZ> = {
  type: 'capital_item',
  label: 'Capital Item',
  pluralLabel: 'Capital Items',
  folderName: 'Capital',
  allowMultiple: true,
  schema: CapitalItemZ,
  version: 1,
  title: (c) => c.title,
  summary: (c) => `${c.priority} · ${c.estimatedYear} · $${c.costLow.toLocaleString()}–$${c.costHigh.toLocaleString()}`,
  filename: (c) => `capital_item_${c.id.slice(0, 8)}.md`,
  fields: [
    { id: 'title',         label: 'Name',         kind: 'text',     required: true },
    { id: 'categoryId',    label: 'Category',     kind: 'text',     required: true },
    { id: 'priority',      label: 'Priority',     kind: 'select',   required: true,
      options: ['critical', 'high', 'medium', 'low'] },
    { id: 'estimatedYear', label: 'Planned Year', kind: 'number',   required: true },
    { id: 'costLow',       label: 'Cost (low)',   kind: 'currency', required: true },
    { id: 'costHigh',      label: 'Cost (high)',  kind: 'currency', required: true },
    { id: 'installYear',   label: 'Installed',    kind: 'number' },
    { id: 'ageYears',      label: 'Age (years)',  kind: 'number' },
    { id: 'status',        label: 'Status',       kind: 'select',
      options: ['planned', 'in-progress', 'complete'] },
    { id: 'percentComplete', label: '% Complete', kind: 'number', unit: '%' },
    { id: 'source',        label: 'Source',       kind: 'select', required: true,
      options: ['manual', 'ai-suggested', 'age-based'] },
    { id: 'notes',         label: 'Notes',        kind: 'textarea' },
    { id: 'propertyId',    label: 'Property',     kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_capital_items',
    description: 'Capital replacement projects — equipment slated for replacement with estimated costs and timing.',
    searchable: ['title', 'categoryId', 'notes'],
  },
}
