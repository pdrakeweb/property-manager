import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Phone, MapPin, Plus, Trash2, AlertTriangle, ShieldAlert,
  Edit2, Check,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { getEmergencyCard, saveEmergencyCard } from '../lib/emergencyStore'

import { useAppStore } from '../store/AppStoreContext'
import type { EmergencyCard } from '../schemas'

function newId() { return crypto.randomUUID() }

type ShutoffRow = EmergencyCard['shutoffs'][number]
type ContactRow = EmergencyCard['contacts'][number]

function emptyCard(propertyId: string): EmergencyCard {
  return {
    propertyId,
    shutoffs: [],
    contacts: [],
    medicalNotes: '',
    criticalNotes: '',
    lastUpdated: new Date().toISOString().split('T')[0],
  }
}

// ── View Mode ────────────────────────────────────────────────────────────────

function ViewMode({ card, propertyName, onEdit }: {
  card: EmergencyCard; propertyName: string; onEdit: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{propertyName}</h1>
          <p className="text-base font-semibold text-red-600 mt-0.5 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            Emergency Information
          </p>
        </div>
        <button
          onClick={onEdit}
          className="btn btn-secondary btn-sm gap-1.5"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>

      {/* Utility Shutoffs */}
      {card.shutoffs.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
            Utility Shutoffs
          </h2>
          <div className="space-y-3">
            {card.shutoffs.map((s, i) => (
              <div key={s.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{s.label}</p>
                  <p className="text-sm text-slate-600 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    {s.location}
                  </p>
                  {s.notes && <p className="text-sm text-slate-500 mt-0.5">{s.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency Contacts */}
      {card.contacts.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
            Emergency Contacts
          </h2>
          <div className="space-y-4">
            {card.contacts.map(c => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{c.name}</p>
                  <p className="text-sm text-slate-500">{c.role}</p>
                  {c.notes && <p className="text-xs text-slate-400 mt-0.5">{c.notes}</p>}
                </div>
                <a
                  href={`tel:${c.phone}`}
                  className="btn btn-primary px-3 text-base font-bold shrink-0"
                >
                  <Phone className="w-4 h-4" />
                  {c.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Notes */}
      {card.criticalNotes && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-2 border-b border-slate-200 pb-2">
            Critical Notes
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{card.criticalNotes}</p>
          </div>
        </div>
      )}

      {/* Medical Notes */}
      {card.medicalNotes && (
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-2 border-b border-slate-200 pb-2">
            Medical Notes
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-900 whitespace-pre-wrap">{card.medicalNotes}</p>
          </div>
        </div>
      )}

      {/* Last updated */}
      <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
        Last updated: {new Date(card.lastUpdated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

// ── Edit Mode ────────────────────────────────────────────────────────────────

function EditMode({ card, onSave, onCancel }: {
  card: EmergencyCard; onSave: (c: EmergencyCard) => void; onCancel: () => void
}) {
  const [shutoffs, setShutoffs] = useState<ShutoffRow[]>(card.shutoffs.map(s => ({ ...s })))
  const [contacts, setContacts] = useState<ContactRow[]>(card.contacts.map(c => ({ ...c })))
  const [medicalNotes,  setMedicalNotes]  = useState(card.medicalNotes ?? '')
  const [criticalNotes, setCriticalNotes] = useState(card.criticalNotes ?? '')
  const [saved, setSaved] = useState(false)

  // Shutoff helpers
  function addShutoff() {
    setShutoffs(s => [...s, { id: newId(), label: '', location: '', notes: '' }])
  }
  function removeShutoff(id: string) {
    setShutoffs(s => s.filter(x => x.id !== id))
  }
  function setShutoff(id: string, field: keyof ShutoffRow, val: string) {
    setShutoffs(s => s.map(x => x.id === id ? { ...x, [field]: val } : x))
  }

  // Contact helpers
  function addContact() {
    setContacts(c => [...c, { id: newId(), name: '', role: '', phone: '', notes: '' }])
  }
  function removeContact(id: string) {
    setContacts(c => c.filter(x => x.id !== id))
  }
  function setContact(id: string, field: keyof ContactRow, val: string) {
    setContacts(c => c.map(x => x.id === id ? { ...x, [field]: val } : x))
  }

  function handleSave() {
    const updated: EmergencyCard = {
      ...card,
      shutoffs: shutoffs.filter(s => s.label.trim()),
      contacts: contacts.filter(c => c.name.trim()),
      medicalNotes:  medicalNotes  || undefined,
      criticalNotes: criticalNotes || undefined,
      lastUpdated: new Date().toISOString().split('T')[0],
    }
    onSave(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputCls = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Edit Emergency Card</h1>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary btn-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn btn-info btn-sm gap-1.5"
          >
            {saved ? <Check className="w-4 h-4" /> : null}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Shutoffs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Utility Shutoffs</h2>
          <button
            onClick={addShutoff}
            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        <div className="space-y-4">
          {shutoffs.map((s, i) => (
            <div key={s.id} className="card-surface rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500">Shutoff {i + 1}</span>
                <button onClick={() => removeShutoff(s.id)} className="text-slate-400 hover:text-red-500 p-0.5 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={s.label} onChange={e => setShutoff(s.id, 'label', e.target.value)}
                placeholder="Label (e.g. Main Water Shutoff)"
                className={inputCls}
              />
              <input
                value={s.location} onChange={e => setShutoff(s.id, 'location', e.target.value)}
                placeholder="Location (e.g. Utility room, behind water heater)"
                className={inputCls}
              />
              <input
                value={s.notes ?? ''} onChange={e => setShutoff(s.id, 'notes', e.target.value)}
                placeholder="Notes (optional)"
                className={inputCls}
              />
            </div>
          ))}
          {shutoffs.length === 0 && (
            <button
              onClick={addShutoff}
              className="w-full py-3 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 hover:border-sky-300 hover:text-sky-600"
            >
              + Add first shutoff
            </button>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Emergency Contacts</h2>
          <button
            onClick={addContact}
            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        <div className="space-y-4">
          {contacts.map((c, i) => (
            <div key={c.id} className="card-surface rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500">Contact {i + 1}</span>
                <button onClick={() => removeContact(c.id)} className="text-slate-400 hover:text-red-500 p-0.5 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={c.name} onChange={e => setContact(c.id, 'name', e.target.value)}
                placeholder="Name"
                className={inputCls}
              />
              <input
                value={c.role} onChange={e => setContact(c.id, 'role', e.target.value)}
                placeholder="Role (e.g. 911, Neighbor, Plumber)"
                className={inputCls}
              />
              <input
                type="tel"
                value={c.phone} onChange={e => setContact(c.id, 'phone', e.target.value)}
                placeholder="Phone number"
                className={inputCls}
              />
              <input
                value={c.notes ?? ''} onChange={e => setContact(c.id, 'notes', e.target.value)}
                placeholder="Notes (optional)"
                className={inputCls}
              />
            </div>
          ))}
          {contacts.length === 0 && (
            <button
              onClick={addContact}
              className="w-full py-3 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 hover:border-sky-300 hover:text-sky-600"
            >
              + Add first contact
            </button>
          )}
        </div>
      </div>

      {/* Critical Notes */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Critical Notes</label>
        <textarea
          value={criticalNotes}
          onChange={e => setCriticalNotes(e.target.value)}
          rows={3}
          placeholder="Important info: alarm codes, gate codes, known hazards…"
          className={cn(inputCls, 'resize-none')}
        />
      </div>

      {/* Medical Notes */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Medical Notes</label>
        <textarea
          value={medicalNotes}
          onChange={e => setMedicalNotes(e.target.value)}
          rows={3}
          placeholder="Allergies, medications, medical conditions…"
          className={cn(inputCls, 'resize-none')}
        />
      </div>

      {/* Bottom buttons */}
      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="btn btn-secondary flex-1">
          Cancel
        </button>
        <button onClick={handleSave} className="btn btn-info flex-1">
          Save
        </button>
      </div>
    </div>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function EmergencyScreen() {
  const { propertyId: paramPropertyId } = useParams<{ propertyId?: string }>()
  const { activePropertyId, properties } = useAppStore()
  const propertyId = paramPropertyId ?? activePropertyId

  const property = properties.find(p => p.id === propertyId) ?? properties[0]

  const [editing, setEditing] = useState(false)
  const [card, setCard] = useState<EmergencyCard | null>(() => getEmergencyCard(propertyId))

  function handleSave(updated: EmergencyCard) {
    saveEmergencyCard(updated)
    setCard(updated)
    setEditing(false)
  }

  if (!card && !editing) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{property.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Emergency Information
          </p>
        </div>

        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">No emergency information set up</p>
            <p className="text-sm text-slate-400 mt-1">Add shutoffs, contacts, and critical notes for emergencies.</p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="btn btn-danger btn-lg"
          >
            Set Up Now
          </button>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <EditMode
        card={card ?? emptyCard(propertyId)}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <ViewMode
      card={card!}
      propertyName={property.name}
      onEdit={() => setEditing(true)}
    />
  )
}
