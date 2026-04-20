/**
 * Maintenance task — scheduled work item tied to a property + category.
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const MaintenanceTaskZ = z.object({
  id:            z.string(),
  propertyId:    z.string(),
  title:         z.string().min(1),
  systemLabel:   z.string().default(''),
  categoryId:    z.string().default(''),
  dueDate:       z.string(),
  priority:      z.enum(['critical', 'high', 'medium', 'low']),
  status:        z.enum(['overdue', 'due', 'upcoming', 'completed']),
  recurrence:    z.string().optional(),
  estimatedCost: z.number().optional(),
  contractor:    z.string().optional(),
  notes:         z.string().optional(),
  source:        z.enum(['manual', 'ai-suggested', 'manufacturer', 'ha-trigger']),
})

export type MaintenanceTaskRecord = z.infer<typeof MaintenanceTaskZ>

export const maintenanceTaskDef: RecordDefinition<typeof MaintenanceTaskZ> = {
  type: 'task',
  label: 'Maintenance Task',
  pluralLabel: 'Maintenance Tasks',
  folderName: 'Maintenance Tasks',
  allowMultiple: true,
  schema: MaintenanceTaskZ,
  version: 1,
  title:   (t) => `Maintenance: ${t.title}`,
  summary: (t) => `${t.priority} · ${t.status} · due ${t.dueDate}`,
  filename: (t) => {
    const safe = t.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/__+/g, '_').slice(0, 40)
    return `task_${safe}_${t.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'title',        label: 'Title',        kind: 'text',     required: true,
      showIn: { form: true, markdown: false, docs: true, ai: true } },
    { id: 'systemLabel',  label: 'System',       kind: 'text' },
    { id: 'categoryId',   label: 'Category',     kind: 'text' },
    { id: 'dueDate',      label: 'Due Date',     kind: 'date',     required: true },
    { id: 'priority',     label: 'Priority',     kind: 'select',   required: true,
      options: ['critical', 'high', 'medium', 'low'] },
    { id: 'status',       label: 'Status',       kind: 'select',   required: true,
      options: ['overdue', 'due', 'upcoming', 'completed'] },
    { id: 'recurrence',   label: 'Recurrence',   kind: 'text' },
    { id: 'estimatedCost',label: 'Est. Cost',    kind: 'currency' },
    { id: 'contractor',   label: 'Contractor',   kind: 'text' },
    { id: 'source',       label: 'Source',       kind: 'select',
      options: ['manual', 'ai-suggested', 'manufacturer', 'ha-trigger'] },
    { id: 'notes',        label: 'Notes',        kind: 'textarea' },
    { id: 'propertyId',   label: 'Property',     kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_tasks',
    description: 'Look up maintenance tasks for the current property (by status, category, or keyword).',
    searchable: ['title', 'systemLabel', 'contractor', 'notes'],
  },
}
