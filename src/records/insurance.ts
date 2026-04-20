import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const CoverageAmountsZ = z.object({
  dwelling:         z.number().optional(),
  otherStructures:  z.number().optional(),
  personalProperty: z.number().optional(),
  liability:        z.number().optional(),
  medicalPayments:  z.number().optional(),
  deductible:       z.number().optional(),
})

export const PolicyAgentZ = z.object({
  name:   z.string(),
  phone:  z.string(),
  email:  z.string().optional(),
  agency: z.string().optional(),
})

export const InsurancePolicyZ = z.object({
  id:              z.string(),
  propertyId:      z.string(),
  type:            z.enum(['homeowners', 'farm', 'umbrella', 'flood', 'auto', 'equipment', 'other']),
  insurer:         z.string(),
  policyNumber:    z.string(),
  status:          z.enum(['active', 'expired', 'cancelled', 'pending']),
  effectiveDate:   z.string(),
  renewalDate:     z.string(),
  annualPremium:   z.number().optional(),
  coverageAmounts: CoverageAmountsZ,
  agent:           PolicyAgentZ.optional(),
  driveFileId:     z.string().optional(),
  notes:           z.string().optional(),
})

export type InsurancePolicyRecord = z.infer<typeof InsurancePolicyZ>

export const insuranceDef: RecordDefinition<typeof InsurancePolicyZ> = {
  type: 'insurance',
  label: 'Insurance Policy',
  pluralLabel: 'Insurance Policies',
  folderName: 'Insurance',
  allowMultiple: true,
  schema: InsurancePolicyZ,
  version: 1,
  title: (p) => `Insurance: ${p.type} — ${p.insurer}`,
  summary: (p) => `${p.status} · renews ${p.renewalDate}`,
  filename: (p) => {
    const safe = p.insurer.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    return `insurance_${p.type}_${safe}_${p.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'type',          label: 'Type',        kind: 'select', required: true,
      options: ['homeowners', 'farm', 'umbrella', 'flood', 'auto', 'equipment', 'other'] },
    { id: 'insurer',       label: 'Insurer',     kind: 'text', required: true },
    { id: 'policyNumber',  label: 'Policy #',    kind: 'text', required: true },
    { id: 'status',        label: 'Status',      kind: 'select', required: true,
      options: ['active', 'expired', 'cancelled', 'pending'] },
    { id: 'effectiveDate', label: 'Effective',   kind: 'date', required: true },
    { id: 'renewalDate',   label: 'Renewal',     kind: 'date', required: true },
    { id: 'annualPremium', label: 'Premium',     kind: 'currency', unit: '/yr' },
    { id: 'notes',         label: 'Notes',       kind: 'textarea' },
    { id: 'coverageAmounts', label: 'Coverage Amounts', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'agent',         label: 'Agent',       kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'propertyId',    label: 'Property',    kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'driveFileId',   label: 'Drive File',  kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_insurance_policies',
    description: 'Insurance policies covering the property — coverage, renewal, agent.',
    searchable: ['type', 'insurer', 'policyNumber', 'notes'],
  },
}
