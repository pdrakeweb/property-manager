import { makeStore } from './localStore'
import type { MaintenanceTask } from '../types'

/** Custom tasks created via the dashboard quick-add form */
export const customTaskStore = makeStore<MaintenanceTask>('pm_custom_tasks')

export function getCustomTasksForProperty(propertyId: string): MaintenanceTask[] {
  return customTaskStore.getAll().filter(t => t.propertyId === propertyId)
}

export function getAllCustomTasks(): MaintenanceTask[] {
  return customTaskStore.getAll()
}
