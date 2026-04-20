export type PermitType =
  | 'building'
  | 'electrical'
  | 'plumbing'
  | 'septic'
  | 'well'
  | 'zoning'
  | 'inspection'
  | 'certificate'
  | 'other'

export type PermitStatus =
  | 'open'
  | 'approved'
  | 'expired'
  | 'rejected'
  | 'pending_inspection'

export interface Permit {
  id: string
  propertyId: string
  type: PermitType
  status: PermitStatus
  permitNumber: string
  description: string
  issuedDate?: string        // YYYY-MM-DD
  expiryDate?: string        // YYYY-MM-DD
  inspectionDate?: string    // YYYY-MM-DD
  issuer: string             // e.g. "Township of Wayne"
  contractor?: string
  cost?: number
  driveFileId?: string
  notes?: string
}

export const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  building:    'Building Permit',
  electrical:  'Electrical Permit',
  plumbing:    'Plumbing Permit',
  septic:      'Septic Permit',
  well:        'Well Permit',
  zoning:      'Zoning / Variance',
  inspection:  'General Inspection',
  certificate: 'Certificate of Occupancy',
  other:       'Other',
}

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  open:               'Open',
  approved:           'Approved',
  expired:            'Expired',
  rejected:           'Rejected',
  pending_inspection: 'Pending Inspection',
}
