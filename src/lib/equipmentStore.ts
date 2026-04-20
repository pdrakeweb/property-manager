import { makeStore } from './localStore'

export interface EquipmentRecord {
  id: string          // uuid
  categoryId: string
  propertyId: string
  capturedAt: string  // ISO string
}

export const equipmentStore = makeStore<EquipmentRecord>('pm_equipment_records')

export function countByCategory(categoryId: string, propertyId: string): number {
  return equipmentStore.getAll().filter(
    r => r.categoryId === categoryId && r.propertyId === propertyId,
  ).length
}

export function countDocumentedCategories(categoryIds: string[], propertyId: string): number {
  const recorded = new Set(
    equipmentStore.getAll()
      .filter(r => r.propertyId === propertyId)
      .map(r => r.categoryId),
  )
  return categoryIds.filter(id => recorded.has(id)).length
}
