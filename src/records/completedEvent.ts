import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const EventPhotoZ = z.object({
  id:           z.string(),
  role:         z.enum(['before', 'after', 'general']),
  localDataUrl: z.string(),
  driveFileId:  z.string().optional(),
  caption:      z.string().optional(),
})

export const CompletedEventZ = z.object({
  id:                   z.string(),
  taskId:               z.string(),
  taskTitle:            z.string(),
  categoryId:           z.string().default(''),
  propertyId:           z.string(),
  completionDate:       z.string(),
  cost:                 z.number().optional(),
  paymentMethod:        z.enum(['cash', 'check', 'card', 'ach']).optional(),
  invoiceRef:           z.string().optional(),
  vendorId:             z.string().optional(),
  contractor:           z.string().optional(),
  laborWarrantyExpiry:  z.string().optional(),
  notes:                z.string().optional(),
  photos:               z.array(EventPhotoZ).optional(),
})

export type CompletedEventRecord = z.infer<typeof CompletedEventZ>

export const completedEventDef: RecordDefinition<typeof CompletedEventZ> = {
  type: 'completed_event',
  label: 'Service Event',
  pluralLabel: 'Service History',
  folderName: 'Service History',
  allowMultiple: true,
  schema: CompletedEventZ,
  version: 1,
  title: (e) => `Service: ${e.taskTitle}`,
  summary: (e) => `${e.completionDate}${e.contractor ? ' · ' + e.contractor : ''}`,
  filename: (e) => {
    const safe = e.taskTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    return `service_${safe}_${e.completionDate}.md`
  },
  fields: [
    { id: 'taskTitle',           label: 'Task',          kind: 'text' },
    { id: 'completionDate',      label: 'Date',          kind: 'date', required: true },
    { id: 'categoryId',          label: 'Category',      kind: 'text' },
    { id: 'cost',                label: 'Cost',          kind: 'currency' },
    { id: 'paymentMethod',       label: 'Payment',       kind: 'select',
      options: ['cash', 'check', 'card', 'ach'] },
    { id: 'invoiceRef',          label: 'Invoice',       kind: 'text' },
    { id: 'contractor',          label: 'Contractor',    kind: 'text' },
    { id: 'laborWarrantyExpiry', label: 'Labor Warranty', kind: 'date' },
    { id: 'notes',               label: 'Notes',         kind: 'textarea' },
    { id: 'propertyId', label: 'Property', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'taskId',     label: 'Task ID',  kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'vendorId',   label: 'Vendor',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'photos',     label: 'Photos',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_service_events',
    description: 'Completed service events with cost, contractor, invoice, and labor warranty.',
    searchable: ['taskTitle', 'contractor', 'notes', 'invoiceRef'],
  },
}
