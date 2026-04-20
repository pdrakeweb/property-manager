/**
 * Generator record — engine/generator with cumulative runtime hours.
 *
 * `entries` is a variable-length log of runtime events; the default
 * markdown generator renders it as a GitHub table via `markdownFormat: 'table'`.
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const GeneratorRuntimeEntryZ = z.object({
  id:     z.string(),
  date:   z.string(),
  hours:  z.number(),
  reason: z.string().optional(),
  source: z.enum(['manual', 'service-reset']),
})

export const GeneratorZ = z.object({
  id:               z.string(),
  propertyId:       z.string(),
  name:             z.string(),
  model:            z.string().optional(),
  installedYear:    z.number().optional(),
  lastServiceHours: z.number(),
  cumulativeHours:  z.number(),
  notes:            z.string().optional(),
  entries:          z.array(GeneratorRuntimeEntryZ).default([]),
})

export type GeneratorRecordDsl = z.infer<typeof GeneratorZ>

export const generatorDef: RecordDefinition<typeof GeneratorZ> = {
  type: 'generator_log',
  label: 'Generator',
  pluralLabel: 'Generators',
  folderName: 'Generator',
  allowMultiple: true,
  schema: GeneratorZ,
  version: 1,
  title: (g) => `Generator: ${g.name}`,
  summary: (g) => `${g.cumulativeHours} hrs · last service ${g.lastServiceHours}`,
  filename: (g) => {
    const safe = g.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
    return `generator_${safe}_${g.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'name',             label: 'Name',               kind: 'text', required: true,
      placeholder: 'Generac 22kW' },
    { id: 'model',            label: 'Model',              kind: 'text' },
    { id: 'installedYear',    label: 'Installed',          kind: 'number' },
    { id: 'cumulativeHours',  label: 'Cumulative Hours',   kind: 'number', unit: 'hrs' },
    { id: 'lastServiceHours', label: 'Last Service Hours', kind: 'number', unit: 'hrs' },
    { id: 'notes',            label: 'Notes',              kind: 'textarea' },
    {
      id: 'entries', label: 'Runtime Log', kind: 'array', markdownFormat: 'table',
      of: [
        { id: 'date',   label: 'Date',   kind: 'date',   required: true },
        { id: 'hours',  label: 'Hours',  kind: 'number', required: true, unit: 'hrs' },
        { id: 'reason', label: 'Reason', kind: 'text' },
        { id: 'source', label: 'Source', kind: 'select',
          options: ['manual', 'service-reset'] },
      ],
    },
    { id: 'propertyId', label: 'Property', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_generators',
    description: 'Generator equipment with cumulative runtime hours and service history.',
    searchable: ['name', 'model', 'notes'],
  },
}
