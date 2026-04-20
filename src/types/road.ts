export type RoadMaintenanceTypeId =
  | 'gravel_delivery'
  | 'culvert_cleaning'
  | 'plowing_service'
  | 'washout_repair'
  | 'vegetation_control'
  | 'gate_maintenance'
  | 'other'

export interface RoadMaintenanceType {
  id: RoadMaintenanceTypeId
  label: string
  hasQuantity: boolean
  unit?: string
}

export const ROAD_MAINTENANCE_TYPES: RoadMaintenanceType[] = [
  { id: 'gravel_delivery',    label: 'Gravel Delivery',    hasQuantity: true,  unit: 'tons'  },
  { id: 'culvert_cleaning',   label: 'Culvert Cleaning',   hasQuantity: false               },
  { id: 'plowing_service',    label: 'Plowing Service',    hasQuantity: false               },
  { id: 'washout_repair',     label: 'Washout Repair',     hasQuantity: false               },
  { id: 'vegetation_control', label: 'Vegetation Control', hasQuantity: true,  unit: 'yards' },
  { id: 'gate_maintenance',   label: 'Gate / Entrance',    hasQuantity: false               },
  { id: 'other',              label: 'Other',              hasQuantity: false               },
]

export interface RoadEvent {
  id: string
  propertyId: string
  maintenanceTypeId: RoadMaintenanceTypeId
  date: string              // YYYY-MM-DD
  vendor: string
  quantity?: number
  unit?: string
  areaDescription?: string  // "lower lane, first 400ft"
  cost?: number
  notes?: string
}
