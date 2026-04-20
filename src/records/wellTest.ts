/**
 * Well Test record — pilot definition exercising nested-array markdown.
 *
 * Each test carries a variable-length `parameters` array (one row per lab
 * measurement) rendered as a markdown table by the default generator.
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const WellTestParameterZ = z.object({
  name:     z.string(),
  value:    z.string(),
  unit:     z.string(),
  passFail: z.enum(['pass', 'fail', 'advisory']),
})

export type WellTestParameter = z.infer<typeof WellTestParameterZ>

export const WellTestZ = z.object({
  id:             z.string(),
  propertyId:     z.string(),
  date:           z.string(),  // YYYY-MM-DD
  lab:            z.string().optional(),
  technician:     z.string().optional(),
  parameters:     z.array(WellTestParameterZ).default([]),
  overallResult:  z.enum(['pass', 'fail', 'advisory']),
  reportFileId:   z.string().optional(),
  notes:          z.string().optional(),
  nextTestDate:   z.string().optional(),
})

export type WellTest = z.infer<typeof WellTestZ>

export const wellTestDef: RecordDefinition<typeof WellTestZ> = {
  type:        'well_test',
  label:       'Well Test',
  pluralLabel: 'Well Tests',
  folderName:  'Well Tests',
  allowMultiple: true,
  schema:      WellTestZ,
  version:     1,

  title:   (t) => `Well Test — ${t.date}`,
  summary: (t) => `${t.overallResult}${t.lab ? ' · ' + t.lab : ''}`,

  fields: [
    { id: 'date',          label: 'Date',           kind: 'date',    required: true },
    { id: 'lab',           label: 'Lab',            kind: 'text' },
    { id: 'technician',    label: 'Technician',     kind: 'text' },
    { id: 'overallResult', label: 'Overall Result', kind: 'select',
      options: ['pass', 'fail', 'advisory'], required: true },
    { id: 'nextTestDate',  label: 'Next Test Date', kind: 'date' },
    { id: 'notes',         label: 'Notes',          kind: 'textarea' },
    {
      id: 'parameters',
      label: 'Parameters',
      kind: 'array',
      markdownFormat: 'table',
      of: [
        { id: 'name',     label: 'Parameter', kind: 'text', required: true },
        { id: 'value',    label: 'Value',     kind: 'text', required: true },
        { id: 'unit',     label: 'Unit',      kind: 'text' },
        { id: 'passFail', label: 'Result',    kind: 'select',
          options: ['pass', 'fail', 'advisory'], required: true },
      ],
    },
    // Infrastructure fields — hidden from forms/markdown
    { id: 'propertyId',   label: 'Property', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'reportFileId', label: 'Report File', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],

  ai: {
    toolName:    'get_well_tests',
    description: 'Look up well water test results — pass/fail status, lab, parameters.',
    searchable:  ['lab', 'technician', 'notes'],
  },
}
