import { useState, useEffect } from 'react'
import {
  FileCheck, Plus, AlertTriangle, ChevronDown, ChevronUp, X, ExternalLink,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'

import {
  permitStore, getPermitsForProperty,
  getExpiringPermits, getOpenPermits,
} from '../lib/permitStore'
import { DocumentCaptureCard } from '../components/capture/DocumentCaptureCard'
import { extractDocument, confidenceRing } from '../lib/documentExtractor'
import type { ExtractionResult } from '../lib/documentExtractor'
import { PERMIT_TYPE_LABELS, PERMIT_STATUS_LABELS } from '../types/permits'
import type { Permit, PermitType, PermitStatus } from '../types/permits'

// ── Extraction config ─────────────────────────────────────────────────────────

const PERMIT_FIELD_IDS = [
  'permitNumber', 'permitType', 'status',
  'issuedDate', 'expiryDate', 'inspectionDate',
  'issuer', 'contractor', 'cost', 'description',
]

const PERMIT_PROMPT =
  'Extract permit or inspection information from this document. ' +
  'Fields: permitNumber, permitType (building/electrical/plumbing/septic/well/zoning/inspection/certificate/other), ' +
  'status (open/approved/expired/rejected/pending_inspection), ' +
  'issuedDate and expiryDate and inspectionDate (YYYY-MM-DD format), ' +
  'issuer (name of township, county, or authority), contractor (company or name), ' +
  'cost (number, no $ sign), description (brief description of work). ' +
  'Return empty string with low confidence if a field is not visible.'

async function extractPermit(blob: Blob, mimeType: string): Promise<ExtractionResult> {
  return extractDocument(blob, mimeType, PERMIT_FIELD_IDS, PERMIT_PROMPT)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function expiryAlertClass(permit: Permit): string | null {
  if (!permit.expiryDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const in30  = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  if (permit.expiryDate < today) return 'border-red-300 bg-red-50'
  if (permit.expiryDate <= in30) return 'border-orange-300 bg-orange-50'
  return null
}

function statusChipClass(status: PermitStatus): string {
  switch (status) {
    case 'approved':           return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
    case 'open':               return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
    case 'pending_inspection': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'expired':            return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
    case 'rejected':           return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'
  }
}

function fmt(n: number | undefined): string {
  if (!n) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Sort permits: open/pending first, then approved, then expired/rejected */
function sortPermits(permits: Permit[]): Permit[] {
  const order: Record<PermitStatus, number> = {
    open:               0,
    pending_inspection: 1,
    approved:           2,
    expired:            3,
    rejected:           4,
  }
  return [...permits].sort((a, b) => order[a.status] - order[b.status])
}

type FilterTab = 'all' | 'open' | 'approved' | 'expired'

const inp = 'w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'

// ── Permit Form ───────────────────────────────────────────────────────────────

function PermitForm({
  initial,
  propertyId,
  onSave,
  onClose,
}: {
  initial?: Permit
  propertyId: string
  onSave: () => void
  onClose: () => void
}) {
  const [extracted,      setExtracted]      = useState<ExtractionResult>({})
  const [type,           setType]           = useState<PermitType>(initial?.type ?? 'building')
  const [status,         setStatus]         = useState<PermitStatus>(initial?.status ?? 'open')
  const [permitNumber,   setPermitNumber]   = useState(initial?.permitNumber ?? '')
  const [description,    setDescription]    = useState(initial?.description ?? '')
  const [issuer,         setIssuer]         = useState(initial?.issuer ?? '')
  const [contractor,     setContractor]     = useState(initial?.contractor ?? '')
  const [issuedDate,     setIssuedDate]     = useState(initial?.issuedDate ?? '')
  const [expiryDate,     setExpiryDate]     = useState(initial?.expiryDate ?? '')
  const [inspectionDate, setInspectionDate] = useState(initial?.inspectionDate ?? '')
  const [cost,           setCost]           = useState(initial?.cost?.toString() ?? '')
  const [notes,          setNotes]          = useState(initial?.notes ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function applyExtracted(fields: ExtractionResult) {
    setExtracted(fields)
    if (fields.permitNumber?.value)   setPermitNumber(fields.permitNumber.value)
    if (fields.description?.value)    setDescription(fields.description.value)
    if (fields.issuer?.value)         setIssuer(fields.issuer.value)
    if (fields.contractor?.value)     setContractor(fields.contractor.value)
    if (fields.issuedDate?.value)     setIssuedDate(fields.issuedDate.value)
    if (fields.expiryDate?.value)     setExpiryDate(fields.expiryDate.value)
    if (fields.inspectionDate?.value) setInspectionDate(fields.inspectionDate.value)
    if (fields.cost?.value)           setCost(fields.cost.value)
    // Map permitType string to enum
    if (fields.permitType?.value) {
      const v = fields.permitType.value.toLowerCase()
      if (v.includes('electric'))                         setType('electrical')
      else if (v.includes('plumb'))                       setType('plumbing')
      else if (v.includes('septic'))                      setType('septic')
      else if (v.includes('well'))                        setType('well')
      else if (v.includes('zon') || v.includes('varia')) setType('zoning')
      else if (v.includes('inspect'))                     setType('inspection')
      else if (v.includes('certif') || v.includes('occ')) setType('certificate')
      else if (v.includes('build') || v.includes('const')) setType('building')
    }
    // Map status string to enum
    if (fields.status?.value) {
      const v = fields.status.value.toLowerCase()
      if (v.includes('approv'))                           setStatus('approved')
      else if (v.includes('expir'))                       setStatus('expired')
      else if (v.includes('reject') || v.includes('den')) setStatus('rejected')
      else if (v.includes('inspect'))                     setStatus('pending_inspection')
      else                                                setStatus('open')
    }
  }

  function handleSave() {
    if (!issuer.trim() || !description.trim()) return
    const permit: Permit = {
      id:             initial?.id ?? crypto.randomUUID(),
      propertyId,
      type,
      status,
      permitNumber:   permitNumber.trim(),
      description:    description.trim(),
      issuer:         issuer.trim(),
      contractor:     contractor.trim() || undefined,
      issuedDate:     issuedDate || undefined,
      expiryDate:     expiryDate || undefined,
      inspectionDate: inspectionDate || undefined,
      cost:           cost ? Number(cost) : undefined,
      notes:          notes.trim() || undefined,
    }
    if (initial) permitStore.update(permit)
    else         permitStore.add(permit)
    onSave()
    onClose()
  }

  const confRing = (field: string) => extracted[field] ? confidenceRing(extracted[field].confidence) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initial ? 'Edit Permit' : 'Add Permit / Inspection'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document capture */}
        <DocumentCaptureCard
          label="Photograph or upload permit / inspection report for AI extraction"
          extractFn={extractPermit}
          onExtracted={applyExtracted}
        />

        {/* Type + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Permit Type</label>
            <select value={type} onChange={e => setType(e.target.value as PermitType)} className={inp}>
              {Object.entries(PERMIT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as PermitStatus)} className={inp}>
              {Object.entries(PERMIT_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Permit # + Issuer */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Permit Number</label>
            <input
              value={permitNumber} onChange={e => setPermitNumber(e.target.value)}
              placeholder="e.g. BLD-2024-0042"
              className={cn(inp, confRing('permitNumber'))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Issuing Authority *</label>
            <input
              value={issuer} onChange={e => setIssuer(e.target.value)}
              placeholder="e.g. Township of Wayne"
              className={cn(inp, confRing('issuer'))}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Brief description of permitted work"
            className={cn(inp, confRing('description'))}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Issued Date</label>
            <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className={cn(inp, confRing('issuedDate'))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date</label>
            <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={cn(inp, confRing('expiryDate'))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Inspection Date</label>
            <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} className={cn(inp, confRing('inspectionDate'))} />
          </div>
        </div>

        {/* Contractor + Cost */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contractor</label>
            <input
              value={contractor} onChange={e => setContractor(e.target.value)}
              placeholder="Contractor name"
              className={cn(inp, confRing('contractor'))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Permit Cost</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number" value={cost} onChange={e => setCost(e.target.value)}
                placeholder="0"
                className={cn(inp, 'pl-7', confRing('cost'))}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} placeholder="Conditions, follow-up requirements…"
            className={cn(inp, 'resize-none')}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!issuer.trim() || !description.trim()}
            className="flex-[2] py-3 rounded-2xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-green-300 transition-colors"
          >
            {initial ? 'Save Changes' : 'Add Permit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Permit Card ───────────────────────────────────────────────────────────────

function PermitCard({
  permit, onEdit, onDelete,
}: {
  permit: Permit
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const alertCls = expiryAlertClass(permit)

  return (
    <div className={cn('border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden', alertCls && alertCls.replace('border-', 'border-l-4 border-l-'))}>
      <button
        onClick={() => setExpanded(x => !x)}
        className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <FileCheck className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{permit.description}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {PERMIT_TYPE_LABELS[permit.type]}
            {permit.permitNumber ? ` · ${permit.permitNumber}` : ''}
          </p>
        </div>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0', statusChipClass(permit.status))}>
          {PERMIT_STATUS_LABELS[permit.status]}
        </span>
        {expanded
          ? <ChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">

          {/* Issuer + dates */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Issuing Authority</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{permit.issuer}</p>
            </div>
            {permit.issuedDate && (
              <div>
                <p className="text-slate-500 dark:text-slate-400">Issued</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{permit.issuedDate}</p>
              </div>
            )}
            {permit.expiryDate && (
              <div>
                <p className="text-slate-500 dark:text-slate-400">Expires</p>
                <p className={cn('font-medium', permit.expiryDate < new Date().toISOString().slice(0, 10) ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200')}>
                  {permit.expiryDate}
                </p>
              </div>
            )}
            {permit.inspectionDate && (
              <div>
                <p className="text-slate-500 dark:text-slate-400">Inspection</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{permit.inspectionDate}</p>
              </div>
            )}
          </div>

          {/* Contractor + cost */}
          {(permit.contractor || permit.cost) && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
              {permit.contractor && (
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Contractor</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{permit.contractor}</p>
                </div>
              )}
              {permit.cost !== undefined && (
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Permit Cost</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{fmt(permit.cost)}</p>
                </div>
              )}
            </div>
          )}

          {permit.driveFileId && (
            <a
              href={`https://drive.google.com/file/d/${permit.driveFileId}/view`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              View permit document in Drive
            </a>
          )}

          {permit.notes && (
            <p className="text-xs text-slate-500 italic">{permit.notes}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onEdit}
              className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function PermitsScreen() {
  const { activePropertyId, properties } = useAppStore()
  const [tick,       setTick]       = useState(0)
  const [showForm,   setShowForm]   = useState(false)
  const [editPermit, setEditPermit] = useState<Permit | undefined>()
  const [filter,     setFilter]     = useState<FilterTab>('all')

  function refresh() { setTick(t => t + 1) }

  const activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const allPermits     = getPermitsForProperty(activePropertyId)
  const expiring       = getExpiringPermits(activePropertyId, 30)
  const openPermits    = getOpenPermits(activePropertyId)

  const expiredPermits = allPermits.filter(p => {
    if (!p.expiryDate) return false
    return p.expiryDate < new Date().toISOString().slice(0, 10)
  })

  const filtered = sortPermits(
    filter === 'all'      ? allPermits :
    filter === 'open'     ? allPermits.filter(p => p.status === 'open' || p.status === 'pending_inspection') :
    filter === 'approved' ? allPermits.filter(p => p.status === 'approved') :
                            allPermits.filter(p => p.status === 'expired'),
  )

  function openAdd()  { setEditPermit(undefined); setShowForm(true) }
  function openEdit(p: Permit) { setEditPermit(p); setShowForm(true) }
  function handleDelete(id: string) {
    if (!confirm('Delete this permit record?')) return
    permitStore.remove(id)
    refresh()
  }

  const TAB_ITEMS: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',      label: 'All',      count: allPermits.length },
    { id: 'open',     label: 'Open',     count: openPermits.length },
    { id: 'approved', label: 'Approved', count: allPermits.filter(p => p.status === 'approved').length },
    { id: 'expired',  label: 'Expired',  count: allPermits.filter(p => p.status === 'expired').length },
  ]

  return (
    <div className="space-y-5" key={tick}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Permits &amp; Inspections</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeProperty.shortName} · {allPermits.length} {allPermits.length === 1 ? 'record' : 'records'}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Permit
        </button>
      </div>

      {/* Expiry alerts */}
      {(expiredPermits.length > 0 || expiring.length > 0) && (
        <div className="space-y-2">
          {expiredPermits.length > 0 && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {expiredPermits.length} {expiredPermits.length === 1 ? 'permit has' : 'permits have'} expired — action may be required
              </p>
            </div>
          )}
          {expiring.length > 0 && (
            <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700 font-medium">
                {expiring.length} {expiring.length === 1 ? 'permit expires' : 'permits expire'} within 30 days
              </p>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
        {TAB_ITEMS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors',
              filter === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-xs',
                filter === tab.id ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400',
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Permit list */}
      {filtered.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
          {filtered.map(permit => (
            <PermitCard
              key={permit.id}
              permit={permit}
              onEdit={() => openEdit(permit)}
              onDelete={() => handleDelete(permit.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-sm text-center">
          <FileCheck className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
          {filter === 'all' ? (
            <>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No permits on record</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Track building permits, inspections, and certifications for easy access and expiry alerts.
              </p>
              <button onClick={openAdd} className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium">
                + Add your first permit
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No {filter} permits</p>
          )}
        </div>
      )}

      {showForm && (
        <PermitForm
          initial={editPermit}
          propertyId={activePropertyId}
          onSave={refresh}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
