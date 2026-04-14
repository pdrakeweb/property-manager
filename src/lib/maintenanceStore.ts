import { makeStore } from './localStore'
import { MAINTENANCE_TASKS } from '../data/mockData'
import type { MaintenanceTask } from '../types'

// ── Custom tasks (user-created) ───────────────────────────────────────────────

/** Custom tasks created via add-task forms. Persisted under `pm_tasks`. */
export const customTaskStore = makeStore<MaintenanceTask>('pm_tasks')

// Backwards-compat alias (old key used in DashboardScreen quick-add)
const _legacyStore = makeStore<MaintenanceTask>('pm_custom_tasks')

export function getAllCustomTasks(): MaintenanceTask[] {
  return [...customTaskStore.getAll(), ..._legacyStore.getAll()]
}

export function getCustomTasksForProperty(propertyId: string): MaintenanceTask[] {
  return getAllCustomTasks().filter(t => t.propertyId === propertyId)
}

// ── Task overrides (delay/recurrence changes on static tasks) ─────────────────

export interface TaskOverride {
  id: string      // matches MaintenanceTask.id
  dueDate?: string
  recurrence?: string
}

export const taskOverrideStore = makeStore<TaskOverride>('pm_task_overrides')

export function applyOverride(task: MaintenanceTask): MaintenanceTask {
  const override = taskOverrideStore.getAll().find(o => o.id === task.id)
  if (!override) return task
  const dueDate   = override.dueDate    ?? task.dueDate
  const recurrence = override.recurrence ?? task.recurrence
  // Recalculate status from updated dueDate
  const today     = new Date().toISOString().slice(0, 10)
  const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  let status = task.status
  if (status !== 'completed') {
    if (dueDate < today)      status = 'overdue'
    else if (dueDate <= sevenDays) status = 'due'
    else                      status = 'upcoming'
  }
  return { ...task, dueDate, recurrence, status }
}

export function setTaskDelay(taskId: string, newDueDate: string): void {
  const existing = taskOverrideStore.getAll().find(o => o.id === taskId)
  if (existing) {
    taskOverrideStore.update({ ...existing, dueDate: newDueDate })
  } else {
    taskOverrideStore.add({ id: taskId, dueDate: newDueDate })
  }
  // Also update custom task if it lives there
  const ct = customTaskStore.getAll().find(t => t.id === taskId)
  if (ct) customTaskStore.update({ ...ct, dueDate: newDueDate, status: 'upcoming' })
  const lt = _legacyStore.getAll().find(t => t.id === taskId)
  if (lt) _legacyStore.update({ ...lt, dueDate: newDueDate, status: 'upcoming' })
}

export function setTaskRecurrence(taskId: string, recurrence: string): void {
  const existing = taskOverrideStore.getAll().find(o => o.id === taskId)
  if (existing) {
    taskOverrideStore.update({ ...existing, recurrence })
  } else {
    taskOverrideStore.add({ id: taskId, recurrence })
  }
  const ct = customTaskStore.getAll().find(t => t.id === taskId)
  if (ct) customTaskStore.update({ ...ct, recurrence })
  const lt = _legacyStore.getAll().find(t => t.id === taskId)
  if (lt) _legacyStore.update({ ...lt, recurrence })
}

// ── Unified active-task query (used by all screens) ───────────────────────────

/**
 * Returns all tasks for a property — static + custom — with delay/recurrence
 * overrides applied and status recalculated from the effective dueDate.
 */
export function getActiveTasks(propertyId: string): MaintenanceTask[] {
  const statics = MAINTENANCE_TASKS
    .filter(t => t.propertyId === propertyId)
    .map(applyOverride)
  const customs = getAllCustomTasks()
    .filter(t => t.propertyId === propertyId)
    .map(applyOverride)
  return [...statics, ...customs]
}
