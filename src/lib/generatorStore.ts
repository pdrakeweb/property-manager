import { makeStore } from './localStore'
import type { GeneratorRecord, GeneratorRuntimeEntry } from '../types/generator'

export const generatorStore = makeStore<GeneratorRecord>('pm_generators')

export function getGeneratorsForProperty(propertyId: string): GeneratorRecord[] {
  return generatorStore.getAll().filter(g => g.propertyId === propertyId)
}

export function addRuntimeEntry(
  generatorId: string,
  entry: Omit<GeneratorRuntimeEntry, 'id'>
): void {
  const record = generatorStore.getById(generatorId)
  if (!record) return
  const newEntry: GeneratorRuntimeEntry = { ...entry, id: crypto.randomUUID() }
  const updatedEntries = [...record.entries, newEntry]
  const cumulativeHours = updatedEntries.reduce((sum, e) => sum + e.hours, 0)
  generatorStore.update({ ...record, entries: updatedEntries, cumulativeHours })
}

export function markServiced(generatorId: string, milestone: string): void {
  const record = generatorStore.getById(generatorId)
  if (!record) return
  const serviceEntry: GeneratorRuntimeEntry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString().split('T')[0],
    hours: 0,
    reason: `Serviced: ${milestone}`,
    source: 'service-reset',
  }
  const updatedEntries = [...record.entries, serviceEntry]
  const cumulativeHours = updatedEntries.reduce((sum, e) => sum + e.hours, 0)
  generatorStore.update({
    ...record,
    entries: updatedEntries,
    cumulativeHours,
    lastServiceHours: cumulativeHours,
  })
}

export function getHoursSinceService(record: GeneratorRecord): number {
  return record.cumulativeHours - record.lastServiceHours
}

export function getMilestoneProgress(
  record: GeneratorRecord,
  intervalHours: number
): number {
  const hoursSince = getHoursSinceService(record)
  const raw = (hoursSince % intervalHours) / intervalHours
  return Math.min(1, Math.max(0, raw))
}
