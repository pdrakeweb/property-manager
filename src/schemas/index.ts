// Schemas and types for Phase 1 features
// These are plain TypeScript types (no zod dependency required)

export interface Vendor {
  id: string
  name: string
  type: string
  phone?: string
  email?: string
  license?: string
  notes?: string
  propertyIds: string[]
  rating?: number
  lastUsed?: string
}

export interface EventPhoto {
  id: string
  role: 'before' | 'after' | 'general'
  /** Base-64 data URL — present only before Drive upload succeeds, or on
   *  legacy records written before photos were uploaded to Drive. */
  localDataUrl?: string
  driveFileId?: string
  mimeType?:    string
  caption?:     string
}

export interface CompletedEvent {
  id: string
  taskId: string
  taskTitle: string
  categoryId: string
  propertyId: string
  completionDate: string
  cost?: number
  paymentMethod?: 'cash' | 'check' | 'card' | 'ach'
  invoiceRef?: string
  vendorId?: string
  contractor?: string
  laborWarrantyExpiry?: string
  notes?: string
  photos?: EventPhoto[]
}

export interface DocExpiry {
  driveFileId: string
  filename: string
  propertyId: string
  categoryId?: string
  expiryDate: string
  expiryType: 'warranty' | 'insurance' | 'permit' | 'contract' | 'other'
  notes?: string
}

export interface EmergencyCard {
  propertyId: string
  shutoffs: Array<{
    id: string
    label: string
    location: string
    notes?: string
  }>
  contacts: Array<{
    id: string
    name: string
    role: string
    phone: string
    notes?: string
  }>
  medicalNotes?: string
  criticalNotes?: string
  lastUpdated: string
}

export interface WellTestParameter {
  name: string
  value: string
  unit: string
  passFail: 'pass' | 'fail' | 'advisory'
}

export interface WellTest {
  id: string
  propertyId: string
  date: string
  lab?: string
  technician?: string
  parameters: WellTestParameter[]
  overallResult: 'pass' | 'fail' | 'advisory'
  reportFileId?: string
  notes?: string
  nextTestDate?: string
}

export interface SepticEvent {
  id: string
  propertyId: string
  date: string
  vendorId?: string
  technician?: string
  gallonsPumped?: number
  cost?: number
  conditionNotes?: string
  techNotes?: string
  nextRecommendedDate?: string
}

export interface FuelDelivery {
  id: string
  propertyId: string
  date: string
  fuelType: 'propane' | 'heating_oil' | 'diesel' | 'gasoline' | 'other'
  gallons: number
  pricePerGallon: number
  totalCost: number
  vendorId?: string
  tankId?: string
  notes?: string
}

// ── Property Tax ─────────────────────────────────────────────────────────────

export interface TaxAssessment {
  id: string
  propertyId: string
  year: number
  assessedLand: number
  assessedImprovement: number
  totalAssessed: number
  marketValue?: number
  notes?: string
}

export interface TaxPayment {
  id: string
  propertyId: string
  year: number
  installment: 1 | 2
  dueDate: string
  paidDate?: string
  amount: number
  penalty?: number
  notes?: string
}

// ── Mortgage ─────────────────────────────────────────────────────────────────

export interface Mortgage {
  id: string
  propertyId: string
  label: string            // e.g. "Primary", "HELOC"
  lender: string
  accountNumber?: string
  originalBalance: number
  currentBalance: number
  interestRate: number     // annual %, e.g. 6.75
  termMonths: number
  startDate: string
  monthlyPayment: number
  escrowAmount?: number
  notes?: string
}

export interface MortgagePayment {
  id: string
  mortgageId: string
  propertyId: string
  date: string
  amount: number
  principal: number
  interest: number
  escrow?: number
  extraPrincipal?: number
  notes?: string
}

// ── Utility Bills ────────────────────────────────────────────────────────────

export type UtilityType = 'electric' | 'gas' | 'water' | 'sewer' | 'trash' | 'internet' | 'phone' | 'other'

export interface UtilityAccount {
  id: string
  propertyId: string
  type: UtilityType
  provider: string
  accountNumber?: string
  notes?: string
}

export interface UtilityBill {
  id: string
  accountId: string
  propertyId: string
  periodStart: string
  periodEnd: string
  consumption?: number
  unit?: string            // kWh, CCF, gallons, etc.
  totalCost: number
  ratePerUnit?: number
  driveFileId?: string
  notes?: string
}
