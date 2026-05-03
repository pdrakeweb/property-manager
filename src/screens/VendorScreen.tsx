import { useState } from 'react'
import { Plus, Star, Phone, Trash2, Edit2, X, Users, ChevronLeft } from 'lucide-react'
import { cn } from '../utils/cn'
import { vendorStore } from '../lib/vendorStore'
import { costStore } from '../lib/costStore'
import { useAppStore } from '../store/AppStoreContext'
import { propertyStore } from '../lib/propertyStore'
import { useModalA11y } from '../lib/focusTrap'
import type { Vendor } from '../schemas'

const VENDOR_TYPES = [
  { value: 'hvac',        label: 'HVAC'         },
  { value: 'well',        label: 'Well'         },
  { value: 'septic',      label: 'Septic'       },
  { value: 'electrical',  label: 'Electrical'   },
  { value: 'plumbing',    label: 'Plumbing'     },
  { value: 'propane',     label: 'Propane'      },
  { value: 'roofing',     label: 'Roofing'      },
  { value: 'landscaping', label: 'Landscaping'  },
  { value: 'general',     label: 'General'      },
  { value: 'other',       label: 'Other'        },
]

const TYPE_LABELS: Record<string, string> = Object.fromEntries(VENDOR_TYPES.map(t => [t.value, t.label]))

function Stars({ rating, interactive = false, onChange }: {
  rating?: number; interactive?: boolean; onChange?: (r: number) => void
}) {
  const [hover, setHover] = useState(0)
  const display = interactive ? (hover || rating || 0) : (rating || 0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type={interactive ? 'button' : undefined}
          onClick={interactive && onChange ? () => onChange(n) : undefined}
          onMouseEnter={interactive ? () => setHover(n) : undefined}
          onMouseLeave={interactive ? () => setHover(0) : undefined}
          className={cn(
            interactive ? 'cursor-pointer' : 'cursor-default pointer-events-none',
            n <= display ? 'text-amber-400' : 'text-slate-200',
          )}
        >
          <Star className="w-3.5 h-3.5 fill-current" />
        </button>
      ))}
    </div>
  )
}

interface VendorFormData {
  name: string
  type: string
  phone: string
  email: string
  license: string
  rating: number
  notes: string
  propertyIds: string[]
}

const emptyForm = (): VendorFormData => ({
  name: '', type: 'general', phone: '', email: '', license: '', rating: 0, notes: '', propertyIds: [],
})

function vendorToForm(v: Vendor): VendorFormData {
  return {
    name: v.name, type: v.type, phone: v.phone ?? '', email: v.email ?? '',
    license: v.license ?? '', rating: v.rating ?? 0, notes: v.notes ?? '',
    propertyIds: v.propertyIds,
  }
}

interface VendorModalProps {
  initial?: Vendor
  onSave: (v: Omit<Vendor, 'id'>) => void
  onClose: () => void
}

function VendorModal({ initial, onSave, onClose }: VendorModalProps) {
  const [form, setForm] = useState<VendorFormData>(initial ? vendorToForm(initial) : emptyForm())
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function set(k: keyof VendorFormData, v: string | number | string[]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function toggleProperty(pid: string) {
    setForm(f => ({
      ...f,
      propertyIds: f.propertyIds.includes(pid)
        ? f.propertyIds.filter(id => id !== pid)
        : [...f.propertyIds, pid],
    }))
  }

  function submit() {
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      type: form.type,
      phone: form.phone || undefined,
      email: form.email || undefined,
      license: form.license || undefined,
      rating: form.rating || undefined,
      notes: form.notes || undefined,
      propertyIds: form.propertyIds,
    })
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-form-modal-title"
        className="modal-surface rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="vendor-form-modal-title" className="text-base font-semibold text-slate-900">{initial ? 'Edit Vendor' : 'Add Vendor'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Buckeye HVAC Services"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            >
              {VENDOR_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input
                type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="(330) 555-0100"
                className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">License #</label>
              <input
                value={form.license} onChange={e => set('license', e.target.value)}
                placeholder="OH-123456"
                className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="vendor@example.com"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rating</label>
            <Stars rating={form.rating} interactive onChange={r => set('rating', r)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Any notes about this vendor…"
              className="w-full text-sm input-surface rounded-xl px-3 py-2.5 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Properties served</label>
            <div className="space-y-2">
              {propertyStore.getAll().map(p => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.propertyIds.includes(p.id)}
                    onChange={() => toggleProperty(p.id)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                  />
                  <span className="text-sm text-slate-700">{p.name}</span>
                </label>
              ))}
            </div>
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
            disabled={!form.name.trim()}
            className="btn btn-info flex-1"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function VendorDetail({ vendor, onEdit, onDelete, onBack }: {
  vendor: Vendor; onEdit: () => void; onDelete: () => void; onBack: () => void
}) {
  const history = costStore.getAll().filter(e => e.vendorId === vendor.id)
  const totalSpend = history.reduce((s, e) => s + (e.cost ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{vendor.name}</h1>
          <p className="text-sm text-slate-500">{TYPE_LABELS[vendor.type] ?? vendor.type}</p>
        </div>
        <button onClick={onEdit} className="p-2 rounded-xl hover:bg-slate-100 text-slate-600">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-2 rounded-xl hover:bg-red-50 text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="card-surface rounded-2xl shadow-sm p-5 space-y-3">
        {vendor.rating && (
          <div className="flex items-center gap-2">
            <Stars rating={vendor.rating} />
            <span className="text-xs text-slate-500">{vendor.rating}/5</span>
          </div>
        )}
        {vendor.phone && (
          <a href={`tel:${vendor.phone}`} className="flex items-center gap-2 text-sky-600 text-sm font-medium">
            <Phone className="w-4 h-4" />
            {vendor.phone}
          </a>
        )}
        {vendor.email && (
          <p className="text-sm text-slate-600">{vendor.email}</p>
        )}
        {vendor.license && (
          <p className="text-sm text-slate-600">License: <span className="font-medium">{vendor.license}</span></p>
        )}
        {vendor.notes && (
          <p className="text-sm text-slate-500">{vendor.notes}</p>
        )}
        {vendor.propertyIds.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {vendor.propertyIds.map(pid => {
              const prop = propertyStore.getById(pid)
              return prop ? (
                <span key={pid} className="text-xs bg-sky-50 text-sky-700 rounded-full px-2.5 py-0.5 border border-sky-100">
                  {prop.shortName}
                </span>
              ) : null
            })}
          </div>
        )}
      </div>

      {/* Service history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Service History</h2>
          {totalSpend > 0 && (
            <span className="text-sm font-semibold text-slate-700">${totalSpend.toLocaleString()} total</span>
          )}
        </div>
        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No service history recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map(e => (
              <div key={e.id} className="card-surface rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{e.taskTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(e.completionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {e.cost && (
                    <span className="text-sm font-semibold text-slate-700 shrink-0">${e.cost.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function VendorScreen() {
  const { activePropertyId } = useAppStore()
  const [vendors, setVendors] = useState<Vendor[]>(() => vendorStore.getAll())
  const [showModal, setShowModal] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | undefined>()
  const [detailVendor, setDetailVendor] = useState<Vendor | undefined>()

  function refresh() { setVendors(vendorStore.getAll()) }

  function handleSave(data: Omit<Vendor, 'id'>) {
    if (editVendor) {
      vendorStore.update({ ...data, id: editVendor.id })
    } else {
      vendorStore.add({ ...data, id: crypto.randomUUID() })
    }
    refresh()
    setShowModal(false)
    setEditVendor(undefined)
  }

  function handleDelete(v: Vendor) {
    if (!confirm(`Delete ${v.name}?`)) return
    vendorStore.remove(v.id)
    refresh()
    setDetailVendor(undefined)
  }

  // Filter to active property
  const filtered = vendors.filter(v =>
    v.propertyIds.length === 0 || v.propertyIds.includes(activePropertyId)
  )

  if (detailVendor) {
    const current = vendors.find(v => v.id === detailVendor.id) ?? detailVendor
    return (
      <>
        <VendorDetail
          vendor={current}
          onBack={() => setDetailVendor(undefined)}
          onEdit={() => { setEditVendor(current); setShowModal(true) }}
          onDelete={() => handleDelete(current)}
        />
        {showModal && (
          <VendorModal
            initial={editVendor}
            onSave={handleSave}
            onClose={() => { setShowModal(false); setEditVendor(undefined) }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Contractors & Vendors</h1>
            <p className="text-sm text-slate-500 mt-0.5">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setEditVendor(undefined); setShowModal(true) }}
            className="btn btn-info"
          >
            <Plus className="w-4 h-4" />
            Add Vendor
          </button>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Users className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-slate-500 font-medium">No contractors added yet.</p>
            <p className="text-sm text-slate-400">Tap + Add Vendor to get started.</p>
          </div>
        )}

        {/* Vendor list */}
        <div className="space-y-3">
          {filtered.map(v => (
            <button
              key={v.id}
              onClick={() => setDetailVendor(v)}
              className="w-full card-surface rounded-2xl shadow-sm px-4 py-4 text-left hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{v.name}</span>
                    <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">
                      {TYPE_LABELS[v.type] ?? v.type}
                    </span>
                  </div>
                  {v.rating ? (
                    <div className="mt-1">
                      <Stars rating={v.rating} />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                    {v.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {v.phone}
                      </span>
                    )}
                    {v.lastUsed && (
                      <span>Last used {new Date(v.lastUsed).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <VendorModal
          initial={editVendor}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditVendor(undefined) }}
        />
      )}
    </>
  )
}
