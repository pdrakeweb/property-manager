/**
 * Offline upload queue backed by IndexedDB via idb-keyval.
 * Jobs survive page reloads and are retried when connectivity is restored.
 */

import { createStore, del, entries, set } from 'idb-keyval'
import { useEffect, useState, useSyncExternalStore } from 'react'

// ─── Store ─────────────────────────────────────────────────────────────────────

const idbStore = createStore('property-manager-db', 'offline-queue')

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PendingJob {
  id: string
  categoryId: string
  fields: Record<string, unknown>
  photoDataUrls: string[]
  createdAt: string
}

// ─── Module-level listener registry ───────────────────────────────────────────
// Used by useSyncExternalStore to push updates to all subscribed components.

type Listener = () => void
const listeners = new Set<Listener>()

function notifyListeners(): void {
  for (const fn of listeners) fn()
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Snapshot: component-visible count. Updated after every mutation.
let countSnapshot = 0

function getCountSnapshot(): number {
  return countSnapshot
}

async function syncCount(): Promise<void> {
  const all = await entries<string, PendingJob>(idbStore)
  countSnapshot = all.length
  notifyListeners()
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Adds a new job to the IndexedDB offline queue.
 * Assigns a UUID and ISO timestamp automatically.
 */
export async function enqueue(
  job: Omit<PendingJob, 'id' | 'createdAt'>,
): Promise<PendingJob> {
  const full: PendingJob = {
    ...job,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await set(full.id, full, idbStore)
  await syncCount()
  return full
}

/**
 * Removes a job from the queue by ID (call after successful upload).
 */
export async function dequeue(id: string): Promise<void> {
  await del(id, idbStore)
  await syncCount()
}

/**
 * Returns all pending jobs sorted oldest-first.
 */
export async function getPending(): Promise<PendingJob[]> {
  const all = await entries<string, PendingJob>(idbStore)
  return all
    .map(([, job]) => job)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ─── React hooks ───────────────────────────────────────────────────────────────

/**
 * Reactive pending-job count. Updates whenever enqueue/dequeue is called
 * from any component in the tree.
 *
 * Uses useSyncExternalStore so the count stays consistent across concurrent
 * React renders without tearing.
 */
export function useOfflineQueueCount(): number {
  // Seed the snapshot on first mount
  useEffect(() => {
    void syncCount()
  }, [])

  return useSyncExternalStore(subscribe, getCountSnapshot)
}

/**
 * Reactive list of all pending jobs. Re-fetches from IndexedDB whenever the
 * queue changes. Useful for the Settings screen "N pending" list.
 */
export function usePendingJobs(): PendingJob[] {
  const count = useOfflineQueueCount() // re-run when queue changes
  const [jobs, setJobs] = useState<PendingJob[]>([])

  useEffect(() => {
    void getPending().then(setJobs)
  }, [count])

  return jobs
}
