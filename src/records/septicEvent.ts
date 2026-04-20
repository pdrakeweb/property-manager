import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const SepticEventZ = z.object({
  id:                  z.string(),
  propertyId:          z.string(),
  date:                z.string(),
  vendorId:            z.string().optional(),
  technician:          z.string().optional(),
  gallonsPumped:       z.number().optional(),
  cost:                z.number().optional(),
  conditionNotes:      z.string().optional(),
  techNotes:           z.string().optional(),
  nextRecommendedDate: z.string().optional(),
})

export type SepticEventRecord = z.infer<typeof SepticEventZ>

export const septicEventDef: RecordDefinition<typeof SepticEventZ> = {
  type: 'septic_event',
  label: 'Septic Event',
  pluralLabel: 'Septic Events',
  folderName: 'Septic System',
  allowMultiple: true,
  schema: SepticEventZ,
  version: 1,
  title: (e) => `Septic · ${e.date}`,
  summary: (e) => `${e.gallonsPumped ? e.gallonsPumped + ' gal' : 'pumped'}${e.technician ? ' · ' + e.technician : ''}`,
  filename: (e) => `septic_${e.date}_${e.id.slice(0, 8)}.md`,
  fields: [
    { id: 'date',                label: 'Date',            kind: 'date', required: true },
    { id: 'gallonsPumped',       label: 'Gallons Pumped',  kind: 'number', unit: 'gal' },
    { id: 'cost',                label: 'Cost',            kind: 'currency' },
    { id: 'technician',          label: 'Technician',      kind: 'text' },
    { id: 'conditionNotes',      label: 'Condition',       kind: 'textarea' },
    { id: 'techNotes',           label: 'Tech Notes',      kind: 'textarea' },
    { id: 'nextRecommendedDate', label: 'Next Recommended', kind: 'date' },
    { id: 'propertyId', label: 'Property', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'vendorId',   label: 'Vendor',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_septic_events',
    description: 'Septic pumping + inspection history.',
    searchable: ['technician', 'conditionNotes', 'techNotes'],
  },
}
