import { localIndex } from './localIndex'
import { seedTasksForProperty } from './syncEngine'
import type { MaintenanceTask } from '../types'

// ── Status recalculation ──────────────────────────────────────────────────────

function recalcStatus(task: MaintenanceTask): MaintenanceTask['status'] {
  if (task.status === 'completed') return 'completed'
  const today     = new Date().toISOString().slice(0, 10)
  const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  if (task.dueDate < today)      return 'overdue'
  if (task.dueDate <= sevenDays) return 'due'
  return 'upcoming'
}

// ── Core task helpers ─────────────────────────────────────────────────────────

function indexToTask(r: ReturnType<typeof localIndex.getAll>[0]): MaintenanceTask {
  return r.data as unknown as MaintenanceTask
}

// ── Unified active-task query ─────────────────────────────────────────────────

/**
 * Returns all tasks for a property from the local index.
 * Seeds from MAINTENANCE_TASKS + old stores on first call per property.
 */
export function getActiveTasks(propertyId: string): MaintenanceTask[] {
  seedTasksForProperty(propertyId)
  return localIndex.getAll('task', propertyId).map(indexToTask)
}

// ── Task mutations ────────────────────────────────────────────────────────────

export function setTaskDelay(taskId: string, newDueDate: string): void {
  const record = localIndex.getById(taskId)
  if (!record) return
  const task    = { ...(record.data as unknown as MaintenanceTask), dueDate: newDueDate }
  task.status   = recalcStatus(task)
  localIndex.upsert({
    ...record,
    data:      task as unknown as Record<string, unknown>,
    syncState: record.syncState === 'local_only' ? 'local_only' : 'pending_upload',
  })
}

export function setTaskRecurrence(taskId: string, recurrence: string): void {
  const record = localIndex.getById(taskId)
  if (!record) return
  localIndex.upsert({
    ...record,
    data:      { ...(record.data as object), recurrence } as Record<string, unknown>,
    syncState: record.syncState === 'local_only' ? 'local_only' : 'pending_upload',
  })
}

export function markTaskDone(taskId: string): void {
  const record = localIndex.getById(taskId)
  if (!record) return
  const task = { ...(record.data as unknown as MaintenanceTask), status: 'completed' as const }
  localIndex.upsert({
    ...record,
    data:      task as unknown as Record<string, unknown>,
    syncState: record.syncState === 'local_only' ? 'local_only' : 'pending_upload',
  })
}

// ── Add task (writes to local index) ─────────────────────────────────────────

function addToIndex(task: MaintenanceTask): void {
  localIndex.upsert({
    id:         task.id,
    type:       'task',
    categoryId: task.categoryId,
    propertyId: task.propertyId,
    title:      task.title,
    data:       task as unknown as Record<string, unknown>,
    syncState:  'pending_upload',
  })
}

// ── customTaskStore shim ──────────────────────────────────────────────────────
// Kept so existing call-sites (MaintenanceScreen AddTaskModal,
// DashboardScreen QuickAddModal) continue to compile without changes.

export const customTaskStore = {
  add(task: MaintenanceTask)    { addToIndex(task) },
  update(task: MaintenanceTask) { addToIndex(task) },
  getAll(): MaintenanceTask[]   {
    // Tasks are now in localIndex — callers should use getActiveTasks() instead.
    // Return empty so we don't double-count; getActiveTasks() is the source of truth.
    return []
  },
}

// ── getAllCustomTasks (used by DashboardScreen) ───────────────────────────────
// Returns user-created tasks only (syncState = pending_upload) across all properties.
export function getAllCustomTasks(): MaintenanceTask[] {
  return localIndex.getPending()
    .filter(r => r.type === 'task')
    .map(indexToTask)
}
