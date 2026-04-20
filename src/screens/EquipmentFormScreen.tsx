import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera, Upload, Sparkles, CheckCircle2, AlertCircle,
  Loader2, X, ChevronLeft, Cloud, Image as ImageIcon, WifiOff, Settings,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES } from '../data/mockData'
import { propertyStore } from '../lib/propertyStore'
import { getValidToken } from '../auth/oauth'
import { DriveClient } from '../lib/driveClient'
import { formatFileStem, formatRecord } from '../lib/markdownFormatter'
import { localIndex } from '../lib/localIndex'
import { getOpenRouterKey } from '../store/settings'
import { useDocumentExtraction, confidenceRing } from '../hooks/useDocumentExtraction'
import type { Category } from '../types'
import type { FieldDef as DslFieldDef } from '../records/_framework'
import { resolveOptions } from '../records/_framework'
import { equipmentDef } from '../records/equipment'
import { getEquipmentProfile } from '../records/equipmentProfiles'

// ── Field adapter ────────────────────────────────────────────────────────────
//
// The per-category field sets live in the DSL plugin registry (see
// `records/equipmentProfiles.ts`). This screen still renders with its local
// `FieldDef` shape, so we adapt DSL `FieldDef` → local shape on the fly.

type FieldDef = {
  id: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'
  options?: string[]
  unit?: string
  placeholder?: string
}

function dslKindToType(kind: DslFieldDef['kind']): FieldDef['type'] {
  switch (kind) {
    case 'textarea':            return 'textarea'
    case 'date':                return 'date'
    case 'select':              return 'select'
    case 'boolean':             return 'boolean'
    case 'number':
    case 'currency':            return 'number'
    default:                    return 'text'
  }
}

function adaptField(f: DslFieldDef): FieldDef {
  return {
    id:           f.id,
    label:        f.label,
    type:         dslKindToType(f.kind),
    options:      f.options ? [...resolveOptions(f)] : undefined,
    unit:         f.unit,
    placeholder:  f.placeholder,
  }
}

/** Resolve the field list for a subsystem category via the plugin registry. */
function fieldsForCategory(categoryId: string): FieldDef[] {
  const profile = getEquipmentProfile(categoryId)
  if (profile) return profile.fields.map(adaptField)
  // Unknown subsystem — fall back to the base equipment field set.
  return equipmentDef.fields.map(adaptField)
}

// ── Component ────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

/** Build a nameplate extraction prompt for a given category and its fields */
function buildExtractionPrompt(categoryLabel: string, fieldIds: string[]): string {
  return (
    `This is a photo of a ${categoryLabel} equipment nameplate or data tag. ` +
    `Extract the following fields: ${fieldIds.join(', ')}. ` +
    `For date fields, use YYYY-MM-DD format. ` +
    `Return confidence high/medium/low for each field. ` +
    `If a field is not visible on the nameplate, return value "" with confidence "low".`
  )
}

export function EquipmentFormScreen() {
  const { categoryId = 'generator' } = useParams<{ categoryId: string }>()
  const navigate = useNavigate()

  const category = CATEGORIES.find(c => c.id === categoryId) as Category | undefined
  const fields   = fieldsForCategory(categoryId)

  const [values,    setValues]    = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [driveLink, setDriveLink] = useState('')

  // Read active property from localStorage (set by AppShell property switcher)
  const activePropertyId = localStorage.getItem('active_property_id') ?? 'tannerville'
  const activeProperty   = propertyStore.getById(activePropertyId) ?? propertyStore.getAll()[0]

  // ── AI extraction via hook ─────────────────────────────────────────────────

  const fieldIds = fields.map(f => f.id)
  // Prefer the plugin-declared extraction prompt; fall back to the legacy
  // generic template when the subsystem isn't registered.
  const profilePrompt = getEquipmentProfile(categoryId)?.extractionPrompt
  const extractionPrompt = profilePrompt ?? buildExtractionPrompt(category?.label ?? categoryId, fieldIds)

  const {
    aiState, extracted, aiError, docs,
    cameraRef, uploadRef,
    handleFilesChosen, removeDoc, clearExtraction,
  } = useDocumentExtraction(fieldIds, extractionPrompt)

  // When extraction completes, pre-populate form fields
  const prevAiDone = useState(false)
  if (aiState === 'done' && !prevAiDone[0]) {
    prevAiDone[1](true)
    const newVals: Record<string, string> = {}
    for (const [k, v] of Object.entries(extracted)) {
      if (v.value) newVals[k] = v.value
    }
    if (Object.keys(newVals).length > 0) setValues(prev => ({ ...prev, ...newVals }))
  }
  if (aiState !== 'done' && prevAiDone[0]) prevAiDone[1](false)

  // ── Save: local index first, then Drive ────────────────────────────────────

  async function handleSave() {
    setSaveState('saving')
    setSaveError('')

    const capturedAt    = new Date()
    const recordId      = crypto.randomUUID()
    const cat: Category = category ?? {
      id: categoryId, label: categoryId, icon: '', description: '',
      propertyTypes: [], allowMultiple: true, hasAIExtraction: false,
    }
    const fileStem   = formatFileStem(cat, values, capturedAt)
    const mdFilename = `${fileStem}.md`
    const mdContent  = formatRecord(cat, values, docs.map(d => d.name), capturedAt)

    const title       = [values['brand'], values['model'] || values['model_number']].filter(Boolean).join(' ') || cat.label
    const jsonFilename = `equipment_${recordId}.json`

    // 1. Write to local index immediately — visible to all screens right away.
    //    filename is set to .json so pushPending() retries correctly when offline.
    localIndex.upsert({
      id:         recordId,
      type:       'equipment',
      categoryId,
      propertyId: activePropertyId,
      title,
      data: {
        values,
        categoryId,
        propertyId:   activePropertyId,
        capturedAt:   capturedAt.toISOString(),
        mdContent,
        mdFilename,
        filename:     jsonFilename,
        rootFolderId: activeProperty.driveRootFolderId,
      },
      syncState: 'pending_upload',
    })

    // 2. Attempt Drive upload now (if online)
    try {
      const token = await getValidToken()

      if (!token) {
        setSaveState('offline')
        return
      }

      const folderId = await DriveClient.resolveFolderId(token, categoryId, activeProperty.driveRootFolderId)

      // Upload human-readable .md file
      const mdFile = await DriveClient.uploadFile(token, folderId, mdFilename, mdContent, 'text/markdown')
      setDriveLink(`https://drive.google.com/file/d/${mdFile.id}/view`)

      // Upload .json sidecar for programmatic restore on fresh browser login
      const jsonContent = JSON.stringify({
        id:         recordId,
        type:       'equipment' as const,
        categoryId,
        propertyId: activePropertyId,
        title,
        data: {
          values,
          categoryId,
          propertyId:   activePropertyId,
          capturedAt:   capturedAt.toISOString(),
          mdFilename,
          filename:     jsonFilename,
          rootFolderId: activeProperty.driveRootFolderId,
        },
        syncState:      'synced' as const,
        driveUpdatedAt: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
      })
      const jsonFile = await DriveClient.uploadFile(token, folderId, jsonFilename, jsonContent, 'application/json')

      // Upload photos (best-effort — failures don't block the records)
      for (const doc of docs) {
        const ext     = doc.name.split('.').pop() ?? 'jpg'
        const docName = `${fileStem}_${doc.name}`
        const mime    = doc.mimeType || `image/${ext}`
        try { await DriveClient.uploadFile(token, folderId, docName, doc.blob, mime) } catch { /* non-fatal */ }
      }

      localIndex.markSynced(recordId, jsonFile.id, new Date().toISOString())
      setSaveState('saved')
      setTimeout(() => navigate('/capture'), 2000)

    } catch (err) {
      // Drive failed — record stays pending_upload in local index.
      // syncEngine.pushPending() will retry it on the next 5-minute sync.
      setSaveState('offline')
      setSaveError(String(err))
    }
  }

  // ── Success / Offline screens ──────────────────────────────────────────────

  if (saveState === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Saved to Drive</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          Saved locally and uploaded to {category?.label ?? categoryId} folder
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          {category?.icon} {values['brand'] || 'Equipment'} {values['model'] || ''} · {new Date().toLocaleDateString()}
        </p>
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 underline mb-6"
          >
            View in Drive ↗
          </a>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">Returning to Capture…</p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (saveState === 'offline') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <WifiOff className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Saved Locally</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Record saved — will sync to Drive when connected.</p>
        {saveError && <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 max-w-xs">{saveError}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/capture')}
          className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {category?.icon} {category?.label ?? categoryId}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">New record · {activeProperty.shortName}</p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, true)}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, true)}
      />

      {/* Photo Capture Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Photograph Nameplate</h2>
            {!getOpenRouterKey() ? (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
              >
                <Settings className="w-3 h-3" />
                Setup AI
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Sparkles className="w-3 h-3" />
                AI extraction
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={aiState === 'extracting'}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Camera
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              disabled={aiState === 'extracting'}
              className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
          <p className="text-center mb-3">
            <button
              type="button"
              onClick={() => document.getElementById('equipment-form-fields')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
            >
              Skip — enter manually ↓
            </button>
          </p>

          {/* AI status banner */}
          {aiState !== 'idle' && (
            <div className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm mb-3',
              aiState === 'extracting' && 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
              aiState === 'done'       && 'bg-emerald-50 text-emerald-700',
              aiState === 'error'      && 'bg-red-50 text-red-700',
            )}>
              {aiState === 'extracting' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              {aiState === 'done'       && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {aiState === 'error'      && <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="font-medium flex-1">
                {aiState === 'extracting' && 'Extracting specifications…'}
                {aiState === 'done'       && 'Extraction complete — review fields below'}
                {aiState === 'error'      && (
                  aiError?.toLowerCase().includes('api key') || aiError?.toLowerCase().includes('openrouter')
                    ? <span>
                        No OpenRouter API key configured.{' '}
                        <button onClick={() => navigate('/settings')} className="underline font-semibold">
                          Configure in Settings →
                        </button>
                      </span>
                    : <span>
                        {aiError || 'Extraction failed.'}{' '}
                        <button
                          type="button"
                          onClick={() => { clearExtraction(); document.getElementById('equipment-form-fields')?.scrollIntoView({ behavior: 'smooth' }) }}
                          className="underline font-semibold"
                        >
                          Enter details manually →
                        </button>
                      </span>
                )}
              </span>
              {(aiState === 'done' || aiState === 'error') && (
                <button
                  onClick={() => { clearExtraction(); setValues({}) }}
                  className="text-xs opacity-70 hover:opacity-100 shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Photo thumbnails */}
          {docs.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {docs.map((d, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden group bg-slate-100 dark:bg-slate-700"
                >
                  {d.mimeType.startsWith('image') ? (
                    <img src={d.preview} alt={d.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 font-medium">PDF</div>
                  )}
                  <button
                    onClick={() => removeDoc(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 text-white rounded-full items-center justify-center hidden group-hover:flex text-xs leading-none"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => uploadRef.current?.click()}
                className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:border-slate-400 transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div id="equipment-form-fields" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Equipment Details</h2>
          {aiState === 'done' && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Green = high confidence · Amber = medium · Red = low — verify all AI-filled fields.
            </p>
          )}
        </div>
        <div className="p-4 space-y-4">
          {fields.map(field => {
            const val        = values[field.id] ?? ''
            const conf       = extracted[field.id]?.confidence
            const ringStyle  = conf ? confidenceRing(conf) : ''
            const baseClass  = 'w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-300 transition-all placeholder:text-slate-400 dark:text-slate-500'

            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {field.label}
                  {field.unit && <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">({field.unit})</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'resize-none', ringStyle)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={val}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'bg-white dark:bg-slate-800', ringStyle)}
                  >
                    <option value="">Select…</option>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={val === 'true'}
                      onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded border-slate-300 text-green-600 dark:text-green-400 focus:ring-green-300"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Yes</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, ringStyle)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex gap-3 pb-4">
        <button
          onClick={() => navigate('/capture')}
          className="flex-1 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="flex-[2] py-3.5 rounded-2xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-green-400 transition-colors flex items-center justify-center gap-2"
        >
          {saveState === 'saving' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving to Drive…</>
          ) : (
            <><Cloud className="w-4 h-4" /> Save to Drive</>
          )}
        </button>
      </div>

    </div>
  )
}
