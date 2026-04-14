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
