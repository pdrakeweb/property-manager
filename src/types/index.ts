export type PropertyType = 'residence' | 'camp' | 'land'

export interface Property {
  id: string
  name: string
  shortName: string
  type: PropertyType
  address: string
  driveRootFolderId: string
  stats: { documented: number; total: number }
  latitude?: number
  longitude?: number
}

export interface GeolocatedProperty extends Property {
  latitude: number
  longitude: number
}

export interface CurrentWeather {
  temperature: number
  humidity: number
  weatherCode: number
  windSpeed: number
  isDay: boolean
  fetchedAt: string
}

export interface ClimateData {
  climateZone: string
  climateZoneDescription: string
  monthlyAvgHigh: number[]
  monthlyAvgLow: number[]
  monthlyPrecipitation: number[]
  annualHDD: number
  annualCDD: number
  fetchedAt: string
}

export interface EnergyRates {
  state: string
  electricityCentsPerKwh: number
  naturalGasDollarsPerTherm: number
}

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'overdue' | 'due' | 'upcoming' | 'completed'
export type UploadStatus = 'draft' | 'pending' | 'uploaded' | 'error'
export type RecordType = 'equipment' | 'service' | 'warranty' | 'activity' | 'invoice'

export interface EquipmentRecord {
  id: string
  propertyId: string
  categoryId: string
  label: string
  brand?: string
  model?: string
  serialNumber?: string
  installYear?: number
  age?: number
  location?: string
  lastServiceDate?: string
  uploadStatus: UploadStatus
  hasPhotos: boolean
  driveFileId?: string
  haEntityId?: string
}

export interface MaintenanceTask {
  id: string
  propertyId: string
  title: string
  systemLabel: string
  categoryId: string
  dueDate: string
  priority: Priority
  status: TaskStatus
  recurrence?: string
  estimatedCost?: number
  contractor?: string
  notes?: string
  source: 'manual' | 'ai-suggested' | 'manufacturer' | 'ha-trigger'
}

export interface CapitalTransaction {
  id: string
  capitalItemId: string
  date: string
  amount: number
  vendorId?: string
  invoiceRef?: string
  notes?: string
}

export interface CapitalItemOverride {
  id: string   // same as capitalItemId
  status: 'planned' | 'in-progress' | 'complete'
  percentComplete: number
}

export interface CapitalItem {
  id: string
  propertyId: string
  title: string
  categoryId: string
  installYear?: number
  ageYears?: number
  priority: Priority
  estimatedYear: number
  costLow: number
  costHigh: number
  notes?: string
  source: 'manual' | 'ai-suggested' | 'age-based'
  status?: 'planned' | 'in-progress' | 'complete'
  percentComplete?: number
}

export interface ServiceRecord {
  id: string
  propertyId: string
  date: string
  systemLabel: string
  contractor?: string
  workDescription: string
  totalCost?: number
}

export interface HAStatus {
  entityId: string
  label: string
  value: string
  unit?: string
  status: 'ok' | 'warning' | 'alert' | 'off' | 'unknown'
}

export interface HAConfig {
  url: string
  token: string
}

export interface HAEntityState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type Category = {
  id: string
  label: string
  icon: string
  description: string
  propertyTypes: PropertyType[]
  allowMultiple: boolean
  hasAIExtraction: boolean
  recordCount?: number
}
