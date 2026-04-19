import { useState, useEffect } from 'react'
import {
  Shield, Plus, Phone, Mail, AlertTriangle, CheckCircle2,
  Circle, ChevronDown, ChevronUp, X, ExternalLink,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'

import {
  insuranceStore, getPoliciesForProperty,
  getExpiringPolicies, getExpiredPolicies,
} from '../lib/insuranceStore'
import { DocumentCaptureCard } from '../components/capture/DocumentCaptureCard'
import { extractDocument, confidenceRing } from '../lib/documentExtractor'
import type { ExtractionResult } from '../lib/documentExtractor'
import {
  COVERAGE_CHECKLIST, POLICY_TYPE_LABELS,
} from '../types/insurance'
import type { InsurancePolicy, PolicyType, PolicyStatus } from '../types/insurance'

// ── Extraction config ─────────────────────────────────────────────────────────

const INSURANCE_FIELD_IDS = [
  'insurer', 'policyNumber', 'policyType',
  'effectiveDate', 'renewalDate', 'annualPremium',
  'dwelling', 'otherStructures', 'personalProperty',
  'liability', 'deductible',
  'agentName', 'agentPhone', 'agentEmail',
]

const INSURANCE_PROMPT =
  'Extract insurance policy information from this declarations page. ' +
  'Fields: insurer (company name), policyNumber, policyType (homeowners/farm/flood/auto/equipment/umbrella/other), ' +
  'effectiveDate and renewalDate (YYYY-MM-DD format), annualPremium (number, no $ sign), ' +
  'coverage amounts: dwelling, otherStructures, personalProperty, liability, deductible (all numbers), ' +
  'agentName, agentPhone, agentEmail. ' +
  'Return empty string with low confidence if a field is not visible.'

async function extractInsurance(blob: Blob, mimeType: string): Promise<ExtractionResult> {
  return extractDocument(blob, mimeType, INSURANCE_FIELD_IDS, INSURANCE_PROMPT)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renewalStatus(policy: InsurancePolicy): { label: string; cls: string } {
  const today  = new Date().toISOString().slice(0, 10)
  const in30   = new Date(Date.now() + 30  * 86_400_000).toISOString().slice(0, 10)
  const in60   = new Date(Date.now() + 60  * 86_400_000).toISOString().slice(0, 10)

  if (policy.renewalDate < today)  return { label: 'Expired',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' }
  if (policy.renewalDate <= in30)  return { label: 'Renews <30d', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' }
  if (policy.renewalDate <= in60)  return { label: 'Renews <60d', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' }
  return { label: 'Active', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' }
}

function fmt(n: number | undefined): string {
  if (!n) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const inp = 'w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'

// ── Policy Form ───────────────────────────────────────────────────────────────

function PolicyForm({
  initial,
  propertyId,
  onSave,
  onClose,
}: {
  initial?: InsurancePolicy
  propertyId: string
  onSave: () => void
  onClose: () => void
}) {
  const [extracted, setExtracted] = useState<ExtractionResult>({})

  // Form state
  const [type,      setType]      = useState<PolicyType>(initial?.type ?? 'homeowners')
  const [insurer,   setInsurer]   = useState(initial?.insurer ?? '')
  const [policyNum, setPolicyNum] = useState(initial?.policyNumber ?? '')
  const [status,    setStatus]    = useState<PolicyStatus>(initial?.status ?? 'active')
  const [effDate,   setEffDate]   = useState(initial?.effectiveDate ?? '')
  const [renDate,   setRenDate]   = useState(initial?.renewalDate ?? '')
  const [premium,   setPremium]   = useState(initial?.annualPremium?.toString() ?? '')
  const [dwelling,  setDwelling]  = useState(initial?.coverageAmounts.dwelling?.toString() ?? '')
  const [otherStr,  setOtherStr]  = useState(initial?.coverageAmounts.otherStructures?.toString() ?? '')
  const [persProp,  setPersProp]  = useState(initial?.coverageAmounts.personalProperty?.toString() ?? '')
  const [liability, setLiability] = useState(initial?.coverageAmounts.liability?.toString() ?? '')
  const [deductible,setDeductible]= useState(initial?.coverageAmounts.deductible?.toString() ?? '')
  const [agentName, setAgentName] = useState(initial?.agent?.name ?? '')
  const [agentPhone,setAgentPhone]= useState(initial?.agent?.phone ?? '')
  const [agentEmail,setAgentEmail]= useState(initial?.agent?.email ?? '')
  const [agentAgency,setAgentAgency] = useState(initial?.agent?.agency ?? '')
  const [notes,     setNotes]     = useState(initial?.notes ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function applyExtracted(fields: ExtractionResult) {
    setExtracted(fields)
    if (fields.insurer?.value)       setInsurer(fields.insurer.value)
    if (fields.policyNumber?.value)  setPolicyNum(fields.policyNumber.value)
    if (fields.effectiveDate?.value) setEffDate(fields.effectiveDate.value)
    if (fields.renewalDate?.value)   setRenDate(fields.renewalDate.value)
    if (fields.annualPremium?.value) setPremium(fields.annualPremium.value)
    if (fields.dwelling?.value)      setDwelling(fields.dwelling.value)
    if (fields.otherStructures?.value) setOtherStr(fields.otherStructures.value)
    if (fields.personalProperty?.value) setPersProp(fields.personalProperty.value)
    if (fields.liability?.value)     setLiability(fields.liability.value)
    if (fields.deductible?.value)    setDeductible(fields.deductible.value)
    if (fields.agentName?.value)     setAgentName(fields.agentName.value)
    if (fields.agentPhone?.value)    setAgentPhone(fields.agentPhone.value)
    if (fields.agentEmail?.value)    setAgentEmail(fields.agentEmail.value)
    // Map policyType string to enum
    if (fields.policyType?.value) {
      const v = fields.policyType.value.toLowerCase()
      if (v.includes('home') || v.includes('dwell'))  setType('homeowners')
      else if (v.includes('farm') || v.includes('out')) setType('farm')
      else if (v.includes('flood'))  setType('flood')
      else if (v.includes('auto') || v.includes('vehicle')) setType('auto')
      else if (v.includes('equipment')) setType('equipment')
      else if (v.includes('umbrella') || v.includes('excess')) setType('umbrella')
    }
  }

  function handleSave() {
    if (!insurer.trim() || !renDate) return
    const policy: InsurancePolicy = {
      id:           initial?.id ?? crypto.randomUUID(),
      propertyId,
      type,
      insurer:      insurer.trim(),
      policyNumber: policyNum.trim(),
      status,
      effectiveDate: effDate || new Date().toISOString().slice(0, 10),
      renewalDate:   renDate,
      annualPremium: premium ? Number(premium) : undefined,
      coverageAmounts: {
        dwelling:        dwelling  ? Number(dwelling)  : undefined,
        otherStructures: otherStr  ? Number(otherStr)  : undefined,
        personalProperty:persProp  ? Number(persProp)  : undefined,
        liability:       liability ? Number(liability) : undefined,
        deductible:      deductible ? Number(deductible) : undefined,
      },
      agent: agentName ? {
        name:   agentName.trim(),
        phone:  agentPhone.trim(),
        email:  agentEmail.trim() || undefined,
        agency: agentAgency.trim() || undefined,
      } : undefined,
      notes: notes.trim() || undefined,
    }
    if (initial) insuranceStore.update(policy)
    else         insuranceStore.add(policy)
    onSave()
    onClose()
  }

  const confRing = (field: string) => extracted[field] ? confidenceRing(extracted[field].confidence) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initial ? 'Edit Policy' : 'Add Insurance Policy'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document capture */}
        <DocumentCaptureCard
          label="Photograph or upload declarations page for AI extraction"
          extractFn={extractInsurance}
          onExtracted={applyExtracted}
        />

        {/* Policy type + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Policy Type</label>
            <select value={type} onChange={e => setType(e.target.value as PolicyType)} className={inp}>
              {Object.entries(POLICY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as PolicyStatus)} className={inp}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Insurer + Policy # */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Insurer *</label>
            <input
              value={insurer} onChange={e => setInsurer(e.target.value)}
              placeholder="e.g. Erie Insurance"
              className={cn(inp, confRing('insurer'))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Policy Number</label>
            <input
              value={policyNum} onChange={e => setPolicyNum(e.target.value)}
              placeholder="Policy #"
              className={cn(inp, confRing('policyNumber'))}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Effective Date</label>
            <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={cn(inp, confRing('effectiveDate'))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Renewal Date *</label>
            <input type="date" value={renDate} onChange={e => setRenDate(e.target.value)} className={cn(inp, confRing('renewalDate'))} />
          </div>
        </div>

        {/* Annual premium */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Annual Premium</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number" value={premium} onChange={e => setPremium(e.target.value)}
              placeholder="0"
              className={cn(inp, 'pl-7', confRing('annualPremium'))}
            />
          </div>
        </div>

        {/* Coverage amounts */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Coverage Amounts</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Dwelling',            dwelling,   setDwelling,  'dwelling'],
              ['Other Structures',    otherStr,   setOtherStr,  'otherStructures'],
              ['Personal Property',   persProp,   setPersProp,  'personalProperty'],
              ['Liability',           liability,  setLiability, 'liability'],
              ['Deductible',          deductible, setDeductible,'deductible'],
            ].map(([label, val, setter, field]) => (
              <div key={field as string}>
                <label className="block text-xs text-slate-500 mb-1">{label as string}</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                  <input
                    type="number" value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)}
                    placeholder="0"
                    className={cn('w-full text-sm input-surface rounded-lg px-2.5 pl-6 py-2', confRing(field as string))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Agent / Contact</p>
          <div className="space-y-2">
            <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Agent name" className={cn(inp, confRing('agentName'))} />
            <input value={agentAgency} onChange={e => setAgentAgency(e.target.value)} placeholder="Agency name" className={inp} />
            <input type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="Phone" className={cn(inp, confRing('agentPhone'))} />
            <input type="email" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} placeholder="Email" className={cn(inp, confRing('agentEmail'))} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} placeholder="Riders, exclusions, endorsements…"
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
            disabled={!insurer.trim() || !renDate}
            className="flex-[2] py-3 rounded-2xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-green-300 transition-colors"
          >
            {initial ? 'Save Changes' : 'Add Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Policy Card ───────────────────────────────────────────────────────────────

function PolicyCard({
  policy, onEdit, onDelete,
}: {
  policy: InsurancePolicy
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { label, cls }          = renewalStatus(policy)
  const ca                      = policy.coverageAmounts

  return (
    <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(x => !x)}
        className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <Shield className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{policy.insurer}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {POLICY_TYPE_LABELS[policy.type]} · {policy.policyNumber || 'No policy #'}
          </p>
        </div>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0', cls)}>
          {label}
        </span>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">

          {/* Dates + premium */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Effective</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{policy.effectiveDate || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Renewal</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{policy.renewalDate}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Premium/yr</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{fmt(policy.annualPremium)}</p>
            </div>
          </div>

          {/* Coverage amounts */}
          {(ca.dwelling || ca.liability || ca.deductible) && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Coverage</p>
              {[
                ['Dwelling',          ca.dwelling],
                ['Other Structures',  ca.otherStructures],
                ['Personal Property', ca.personalProperty],
                ['Liability',         ca.liability],
                ['Deductible',        ca.deductible],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{label as string}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{fmt(val as number)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent */}
          {policy.agent && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Agent</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{policy.agent.name}</p>
              {policy.agent.agency && <p className="text-xs text-slate-500 dark:text-slate-400">{policy.agent.agency}</p>}
              <div className="flex gap-3 mt-2">
                {policy.agent.phone && (
                  <a
                    href={`tel:${policy.agent.phone}`}
                    className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
                  >
                    <Phone className="w-3 h-3" />
                    {policy.agent.phone}
                  </a>
                )}
                {policy.agent.email && (
                  <a
                    href={`mailto:${policy.agent.email}`}
                    className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
                  >
                    <Mail className="w-3 h-3" />
                    Email
                  </a>
                )}
              </div>
            </div>
          )}

          {policy.driveFileId && (
            <a
              href={`https://drive.google.com/file/d/${policy.driveFileId}/view`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              View policy PDF in Drive
            </a>
          )}

          {policy.notes && (
            <p className="text-xs text-slate-500 italic">{policy.notes}</p>
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

export function InsuranceScreen() {
  const { activePropertyId, properties } = useAppStore()
  const [tick,      setTick]      = useState(0)
  const [showForm,  setShowForm]  = useState(false)
  const [editPolicy, setEditPolicy] = useState<InsurancePolicy | undefined>()

  function refresh() { setTick(t => t + 1) }

  const activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const policies       = getPoliciesForProperty(activePropertyId)
  const expiring       = getExpiringPolicies(activePropertyId, 30)
  const expired        = getExpiredPolicies(activePropertyId)

  // Coverage gap checklist
  const activePolicyTypes = new Set(policies.filter(p => p.status === 'active').map(p => p.type))
  const coverageGaps = COVERAGE_CHECKLIST.filter(
    c => c.requiredFor.includes(activeProperty.type) && !activePolicyTypes.has(c.id as InsurancePolicy['type']),
  )

  function openAdd() { setEditPolicy(undefined); setShowForm(true) }
  function openEdit(p: InsurancePolicy) { setEditPolicy(p); setShowForm(true) }
  function handleDelete(id: string) {
    if (!confirm('Delete this policy?')) return
    insuranceStore.remove(id)
    refresh()
  }

  return (
    <div className="space-y-5" key={tick}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Insurance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{activeProperty.shortName} · {policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Policy
        </button>
      </div>

      {/* Renewal alerts */}
      {(expiring.length > 0 || expired.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {expired.length} {expired.length === 1 ? 'policy has' : 'policies have'} expired — renewal required
              </p>
            </div>
          )}
          {expiring.length > 0 && (
            <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700 font-medium">
                {expiring.length} {expiring.length === 1 ? 'policy renews' : 'policies renew'} within 30 days
              </p>
            </div>
          )}
        </div>
      )}

      {/* Coverage gap checklist */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Coverage Checklist</h2>
        <div className="space-y-2">
          {COVERAGE_CHECKLIST.filter(c => c.requiredFor.includes(activeProperty.type)).map(item => {
            const covered = activePolicyTypes.has(item.id as InsurancePolicy['type'])
            return (
              <div key={item.id} className="flex items-center gap-3">
                {covered
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <Circle       className="w-4 h-4 text-red-400 shrink-0" />
                }
                <span className={cn('text-sm', covered ? 'text-slate-700 dark:text-slate-300' : 'text-red-700 dark:text-red-400 font-medium')}>
                  {item.label}
                </span>
                {!covered && (
                  <button
                    onClick={() => { setEditPolicy(undefined); setShowForm(true) }}
                    className="ml-auto text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
                  >
                    + Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {coverageGaps.length === 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2">All coverage types present ✓</p>
        )}
      </div>

      {/* Policy list */}
      {policies.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
          {policies.map(policy => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={() => openEdit(policy)}
              onDelete={() => handleDelete(policy.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-sm text-center">
          <Shield className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No policies added yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Add your homeowners, farm, and umbrella policies for quick access and renewal tracking.</p>
          <button onClick={openAdd} className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium">
            + Add your first policy
          </button>
        </div>
      )}

      {showForm && (
        <PolicyForm
          initial={editPolicy}
          propertyId={activePropertyId}
          onSave={refresh}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
