import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle, X, FileText, Pencil } from 'lucide-react'
import { cn } from '../utils/cn'
import { expiryStore } from '../lib/expiryStore'
import { useAppStore } from '../store/AppStoreContext'
import type { DocExpiry } from '../schemas'

type ExpiryType = DocExpiry['expiryType']

const EXPIRY_TYPES: { value: ExpiryType; label: string }[] = [
  { value: 'warranty',  label: 'Warranty'  },
  { value: 'insurance', label: 'Insurance' },
  { value: 'permit',    label: 'Permit'    },
  { value: 'contract',  label: 'Contract'  },
  { value: 'other',     label: 'Other'     },
]

const TYPE_COLOR: Record<ExpiryType, string> = {
  warranty:  'bg-sky-50 text-sky-700 border-sky-100',
  insurance: 'bg-violet-50 text-violet-700 border-violet-100',
  permit:    'bg-amber-50 text-amber-700 border-amber-100',
  contract:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  other:     'bg-slate-50 text-slate-600 border-slate-200',
}

type DocExpiryWithId = DocExpiry & { id: string }

interface AddFormData {
  filename: string
  expiryDate: string
  expiryType: ExpiryType
  notes: string
  driveFileId: string
  categoryId: string
}

const emptyForm = (): AddFormData => ({
  filename: '', expiryDate: '', expiryType: 'warranty', notes: '', driveFileId: '', categoryId: '',
})

interface AddModalProps {
  propertyId: string
  initial?: DocExpiryWithId
  onSave: (d: DocExpiryWithId) => void
  onClose: () => void
}

function AddModal({ propertyId, initial, onSave, onClose }: AddModalProps) {
  const [form, setForm] = useState<AddFormData>(initial ? {
    filename: initial.filename,
    expiryDate: initial.expiryDate,
    expiryType: initial.expiryType,
    notes: initial.notes ?? '',
    driveFileId: initial.driveFileId ?? '',
    categoryId: initial.categoryId ?? '',
  } : emptyForm())

  function set<K extends keyof AddFormData>(k: K, v: AddFormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    if (!form.filename.trim() || !form.expiryDate) return
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      driveFileId: form.driveFileId || '',
      filename: form.filename.trim(),
      propertyId,
      categoryId: form.categoryId || undefined,
      expiryDate: form.expiryDate,
      expiryType: form.expiryType,
      notes: form.notes || undefined,
    } as DocExpiryWithId)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{initial ? 'Edit Record' : 'Add Expiry Record'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">File / Document Name *</label>
            <input
              value={form.filename}
              onChange={e => set('filename', e.target.value)}
              placeholder="e.g. Roof Warranty 2022"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date *</label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={e => set('expiryDate', e.target.value)}
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={form.expiryType}
              onChange={e => set('expiryType', e.target.value as ExpiryType)}
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            >
              {EXPIRY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Drive File ID (optional)</label>
            <input
              value={form.driveFileId}
              onChange={e => set('driveFileId', e.target.value)}
              placeholder="Google Drive file ID"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any notes about this document…"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!form.filename.trim() || !form.expiryDate}
            className="btn btn-info flex-1"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export function ExpiryManageScreen() {
  const { activePropertyId } = useAppStore()
  const [records, setRecords] = useState<DocExpiryWithId[]>(() =>
    expiryStore.getAll().filter(d => d.propertyId === activePropertyId)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  )
  const [showModal, setShowModal] = useState(false)
  const [editRecord, setEditRecord] = useState<DocExpiryWithId | undefined>()

  function refresh() {
    setRecords(
      expiryStore.getAll().filter(d => d.propertyId === activePropertyId)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    )
  }

  function handleSave(d: DocExpiryWithId) {
    if (editRecord) {
      expiryStore.update(d)
    } else {
      expiryStore.add(d)
    }
    refresh()
    setShowModal(false)
    setEditRecord(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this expiry record?')) return
    expiryStore.remove(id)
    refresh()
  }

  const now = Date.now()

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Document Expiry</h1>
            <p className="text-sm text-slate-500 mt-0.5">{records.length} record{records.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setEditRecord(undefined); setShowModal(true) }}
            className="btn btn-info"
          >
            <Plus className="w-4 h-4" />
            Add Record
          </button>
        </div>

        {records.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <FileText className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-slate-500 font-medium">No expiry records yet.</p>
            <p className="text-sm text-slate-400">Track warranties, permits, insurance policies, and contracts.</p>
          </div>
        )}

        <div className="space-y-3">
          {records.map(d => {
            const days = Math.ceil((new Date(d.expiryDate).getTime() - now) / 86400000)
            const expired = days < 0
            const urgent = days >= 0 && days < 30
            const rowColor = expired ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : urgent ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            const daysText = expired ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`
            const daysColor = expired ? 'text-red-600' : urgent ? 'text-amber-600' : 'text-slate-500'

            return (
              <div key={d.id} className={cn('border rounded-2xl px-4 py-4 shadow-sm', rowColor)}>
                <div className="flex items-start gap-3">
                  {(expired || urgent) && (
                    <AlertTriangle className={cn('w-4 h-4 shrink-0 mt-0.5', expired ? 'text-red-400' : 'text-amber-400')} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{d.filename}</p>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditRecord(d); setShowModal(true) }}
                          className="text-slate-400 hover:text-slate-600 p-2 rounded-lg"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="text-slate-400 hover:text-red-500 p-2 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={cn('text-xs font-medium border rounded-full px-2 py-0.5', TYPE_COLOR[d.expiryType])}>
                        {EXPIRY_TYPES.find(t => t.value === d.expiryType)?.label ?? d.expiryType}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(d.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className={cn('text-xs font-semibold', daysColor)}>{daysText}</span>
                    </div>
                    {d.notes && (
                      <p className="text-xs text-slate-500 mt-1">{d.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <AddModal
          propertyId={activePropertyId}
          initial={editRecord}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditRecord(undefined) }}
        />
      )}
    </>
  )
}
