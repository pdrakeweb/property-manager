export type PolicyType =
  | 'homeowners'
  | 'farm'
  | 'umbrella'
  | 'flood'
  | 'auto'
  | 'equipment'
  | 'other'

export type PolicyStatus = 'active' | 'expired' | 'cancelled' | 'pending'

export interface CoverageAmounts {
  dwelling?: number
  otherStructures?: number
  personalProperty?: number
  liability?: number
  medicalPayments?: number
  deductible?: number
}

export interface PolicyAgent {
  name: string
  phone: string
  email?: string
  agency?: string
}

export interface InsurancePolicy {
  id: string
  propertyId: string
  type: PolicyType
  insurer: string
  policyNumber: string
  status: PolicyStatus
  effectiveDate: string   // YYYY-MM-DD
  renewalDate: string     // YYYY-MM-DD
  annualPremium?: number
  coverageAmounts: CoverageAmounts
  agent?: PolicyAgent
  driveFileId?: string
  notes?: string
}

/** Coverage types to check for gaps, per property type */
export const COVERAGE_CHECKLIST = [
  { id: 'homeowners', label: 'Homeowners / Dwelling',     requiredFor: ['residence', 'camp'] as string[] },
  { id: 'flood',      label: 'Flood Insurance',           requiredFor: ['residence'] as string[] },
  { id: 'equipment',  label: 'Equipment Breakdown',       requiredFor: ['residence'] as string[] },
  { id: 'umbrella',   label: 'Umbrella / Excess Liability', requiredFor: ['residence', 'camp'] as string[] },
  { id: 'farm',       label: 'Farm / Outbuilding Coverage', requiredFor: ['residence'] as string[] },
]

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  homeowners: 'Homeowners',
  farm:       'Farm / Outbuilding',
  umbrella:   'Umbrella',
  flood:      'Flood',
  auto:       'Auto',
  equipment:  'Equipment Breakdown',
  other:      'Other',
}
