import { useState } from 'react'
import { Plus, X, Activity } from 'lucide-react'
import { cn } from '../utils/cn'
import {
  generatorStore,
  getGeneratorsForProperty,
  addRuntimeEntry,
  markServiced,
  getHoursSinceService,
  getMilestoneProgress,
} from '../lib/generatorStore'
import { useAppStore } from '../store/AppStoreContext'
import { GENERATOR_MILESTONES } from '../types/generator'
import type { GeneratorRecord, GeneratorRuntimeEntry } from '../types/generator'

// ── Progress bar color ────────────────────────────────────────────────────────

function progressColor(pct: number): string {
  if (pct >= 0.8) return 'bg-red-500'
  if (pct >= 0.6) return 'bg-amber-500'
  return 'bg-emerald-500'
}

// ── Runtime Entry Modal ───────────────────────────────────────────────────────

interface RuntimeModalProps {
  generatorId: string
  onSave: () => void
  onClose: () => void
}

function RuntimeModal({ generatorId, onSave, onClose }: RuntimeModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')

  const inputCls =
    'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300'

  function handleSave() {
    const h = parseFloat(hours)
    if (!h || h < 0.5) return
    addRuntimeEntry(generatorId, {
      date,
      hours: h,
      reason: reason.trim() || undefined,
      source: 'manual',
    })
    onSave()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="rounded-t-2xl sm:rounded-2xl bg-white p-5 w-full sm:max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Log Runtime</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Hours *</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="0.5"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ice storm, load test, etc."
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hours || parseFloat(hours) < 0.5}
            className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Generator Modal ───────────────────────────────────────────────────────

interface AddGeneratorModalProps {
  propertyId: string
  onSave: () => void
  onClose: () => void
}

function AddGeneratorModal({ propertyId, onSave, onClose }: AddGeneratorModalProps) {
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [installedYear, setInstalledYear] = useState('')
  const [notes, setNotes] = useState('')

  const inputCls =
    'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300'

  function handleSave() {
    if (!name.trim()) return
    const record: GeneratorRecord = {
      id: crypto.randomUUID(),
      propertyId,
      name: name.trim(),
      model: model.trim() || undefined,
      installedYear: installedYear ? parseInt(installedYear, 10) : undefined,
      lastServiceHours: 0,
      cumulativeHours: 0,
      notes: notes.trim() || undefined,
      entries: [],
    }
    generatorStore.add(record)
    onSave()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="rounded-t-2xl sm:rounded-2xl bg-white p-5 w-full sm:max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add Generator</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Generac 22kW"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="7043"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Installed Year</label>
              <input
                type="number"
                value={installedYear}
                onChange={e => setInstalledYear(e.target.value)}
                placeholder="2020"
                min="1990"
                max={new Date().getFullYear()}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={cn(inputCls, 'resize-none')}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Add Generator
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Generator Card ────────────────────────────────────────────────────────────

interface GeneratorCardProps {
  record: GeneratorRecord
  onUpdate: () => void
}

function GeneratorCard({ record, onUpdate }: GeneratorCardProps) {
  const [showRuntimeModal, setShowRuntimeModal] = useState(false)
  const [confirmMilestone, setConfirmMilestone] = useState<string | null>(null)

  const hoursSinceService = getHoursSinceService(record)
  const recentEntries = [...record.entries]
    .filter(e => e.source === 'manual')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  function handleMarkServiced(label: string) {
    markServiced(record.id, label)
    setConfirmMilestone(null)
    onUpdate()
  }

  return (
    <>
      <div className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm space-y-4">
        {/* Card header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{record.name}</h2>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {record.model && (
                <span className="text-xs text-slate-500">Model: {record.model}</span>
              )}
              {record.installedYear && (
                <span className="text-xs text-slate-500">Installed: {record.installedYear}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowRuntimeModal(true)}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-3 py-2 text-xs font-medium shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Runtime
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500 font-medium">Total Hours</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{record.cumulativeHours.toFixed(1)}h</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500 font-medium">Since Last Service</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{hoursSinceService.toFixed(1)}h</p>
          </div>
        </div>

        {/* Milestone progress bars */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Maintenance Milestones</p>
          {GENERATOR_MILESTONES.map(m => {
            const progress = getMilestoneProgress(record, m.intervalHours)
            const hoursInInterval = hoursSinceService % m.intervalHours
            const color = progressColor(progress)
            return (
              <div key={m.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-slate-700 truncate">{m.label}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {hoursInInterval.toFixed(0)}h / {m.intervalHours}h
                    </span>
                  </div>
                  <button
                    onClick={() => setConfirmMilestone(m.label)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2.5 py-1 font-medium shrink-0"
                  >
                    Mark Serviced
                  </button>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={cn('h-2 rounded-full transition-all', color)}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Recent entries */}
        {recentEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Runtime</p>
            <div className="space-y-1.5">
              {recentEntries.map((e: GeneratorRuntimeEntry) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-500 shrink-0">
                      {new Date(e.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {e.reason && (
                      <span className="text-slate-400 truncate">{e.reason}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-700">{e.hours}h</span>
                    <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-[10px]">
                      {e.source === 'service-reset' ? 'service' : 'manual'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {record.notes && (
          <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">{record.notes}</p>
        )}
      </div>

      {/* Runtime entry modal */}
      {showRuntimeModal && (
        <RuntimeModal
          generatorId={record.id}
          onSave={() => { setShowRuntimeModal(false); onUpdate() }}
          onClose={() => setShowRuntimeModal(false)}
        />
      )}

      {/* Confirm service dialog */}
      {confirmMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Mark as Serviced?</h2>
            <p className="text-sm text-slate-600">
              This will record a service event for <strong>{confirmMilestone}</strong> and reset the hours-since-service counter.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmMilestone(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkServiced(confirmMilestone)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function GeneratorScreen() {
  const { activePropertyId } = useAppStore()
  const [generators, setGenerators] = useState<GeneratorRecord[]>(
    () => getGeneratorsForProperty(activePropertyId)
  )
  const [showAddModal, setShowAddModal] = useState(false)

  function refresh() {
    setGenerators(getGeneratorsForProperty(activePropertyId))
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Generator Runtime</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {generators.length} generator{generators.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Generator
          </button>
        </div>

        {/* Empty state */}
        {generators.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Activity className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-slate-500 font-medium">No generator tracked yet.</p>
            <p className="text-sm text-slate-400">Track runtime hours and maintenance milestones.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium mt-2"
            >
              <Plus className="w-4 h-4" />
              Add Generator
            </button>
          </div>
        )}

        {/* Generator cards */}
        <div className="space-y-4">
          {generators.map(g => (
            <GeneratorCard key={g.id} record={g} onUpdate={refresh} />
          ))}
        </div>
      </div>

      {/* Add generator modal */}
      {showAddModal && (
        <AddGeneratorModal
          propertyId={activePropertyId}
          onSave={() => { setShowAddModal(false); refresh() }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}
