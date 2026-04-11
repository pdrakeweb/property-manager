export type PropertyType = 'residence' | 'camp' | 'land'

export interface Property {
  id: string
  name: string
  shortName: string
  type: PropertyType
  address: string
  driveRootFolderId: string
  stats: { documented: number; total: number }
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
