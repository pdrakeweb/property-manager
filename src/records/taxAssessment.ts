import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const TaxAssessmentZ = z.object({
  id:                  z.string(),
  propertyId:          z.string(),
  year:                z.number(),
  assessedLand:        z.number(),
  assessedImprovement: z.number(),
  totalAssessed:       z.number(),
  marketValue:         z.number().optional(),
  notes:               z.string().optional(),
})

export type TaxAssessmentRecord = z.infer<typeof TaxAssessmentZ>

export const taxAssessmentDef: RecordDefinition<typeof TaxAssessmentZ> = {
  type: 'tax_assessment',
  label: 'Tax Assessment',
  pluralLabel: 'Tax Assessments',
  folderName: 'Tax Records',
  allowMultiple: true,
  schema: TaxAssessmentZ,
  version: 1,
  title: (a) => `Tax Assessment — ${a.year}`,
  summary: (a) => `$${a.totalAssessed.toLocaleString()} assessed`,
  filename: (a) => `tax_assessment_${a.year}_${a.id.slice(0, 8)}.md`,
  fields: [
    { id: 'year',                label: 'Year',                 kind: 'number', required: true },
    { id: 'assessedLand',        label: 'Assessed Land',        kind: 'currency', required: true },
    { id: 'assessedImprovement', label: 'Assessed Improvement', kind: 'currency', required: true },
    { id: 'totalAssessed',       label: 'Total Assessed',       kind: 'currency', required: true },
    { id: 'marketValue',         label: 'Market Value',         kind: 'currency' },
    { id: 'notes',               label: 'Notes',                kind: 'textarea' },
    { id: 'propertyId', label: 'Property', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_tax_assessments',
    description: 'County property-tax assessed values by year.',
    searchable: ['notes'],
  },
}
