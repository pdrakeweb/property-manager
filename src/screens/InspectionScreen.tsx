/**
 * Inspection capture flow (Phase 3 §2 — Computer Vision Condition
 * Assessment).
 *
 * Reachable at `/equipment/:id/inspect`. Captures one or more photos
 * (camera or upload), an optional voice note, runs the AI assessment,
 * shows the result, and lets the user save the inspection record and
 * convert the recommended action into a maintenance task.
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Camera, Upload, X, Loader2, Sparkles, Save, Plus } from 'lucide-react'
import { CATEGORIES } from '../data/mockData'
import { localIndex } from '../lib/localIndex'
import { inspectionStore, type Inspection, type InspectionPhoto } from '../lib/inspectionStore'
import { assessCondition } from '../lib/conditionAssessment'
import { AiAssessmentCard } from '../components/inspection/AiAssessmentCard'
import { VoiceMemoButton } from '../components/voice/VoiceMemoButton'
import { useToast } from '../components/Toast'
import { customTaskStore } from '../lib/maintenanceStore'
import { getOpenRouterKey } from '../store/settings'
import type { EquipmentRecord } from '../types'

// Convert urgency → due date offset for a follow-up maintenance task.
const URGENCY_DAYS: Record<string, number> = {
  immediate:        1,
  'within-30-days': 30,
  'within-6-months':180,
  annual:           365,
  monitor:          365,
}

function dueDateFromUrgency(urgency: string): string {
  const days = URGENCY_DAYS[urgency] ?? 90
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function severityToPriority(s: number): 'critical' | 'high' | 'medium' | 'low' {
  if (s >= 5) return 'critical'
  if (s === 4) return 'high'
  if (s === 3) return 'medium'
  return 'low'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function indexEquipmentToLegacy(record: ReturnType<typeof localIndex.getById>): EquipmentRecord | null {
  if (!record || record.type !== 'equipment') return null
  const data   = (record.data ?? {}) as Record<string, unknown>
  const values = (data.values ?? {}) as Record<string, string>
  const installDate = values.install_date
  const installYear = installDate?.slice(0, 4) ? Number(installDate.slice(0, 4)) || undefined : undefined
  return {
    id:           record.id,
    propertyId:   record.propertyId,
    categoryId:   (data.categoryId as string | undefined) ?? record.categoryId ?? '',
    label:        record.title || '',
    brand:        values.brand,
    model:        values.model || values.model_number,
    serialNumber: values.serial_number,
    installYear,
    age:          installYear ? new Date().getFullYear() - installYear : undefined,
    location:     values.location,
    lastServiceDate: values.last_service_date || values.last_pumped || values.last_test_date,
    uploadStatus: 'pending',
    hasPhotos:    false,
    driveFileId:  record.driveFileId,
    haEntityId:   data.haEntityId as string | undefined,
  }
}

type State = 'capture' | 'assessing' | 'reviewing'

export function InspectionScreen() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const indexRecord = useMemo(() => localIndex.getById(id), [id])
  const equipment   = useMemo(() => indexEquipmentToLegacy(indexRecord), [indexRecord])
  const category    = useMemo(() => CATEGORIES.find(c => c.id === equipment?.categoryId), [equipment])
  const hasKey      = !!getOpenRouterKey()

  const [state,         setState]         = useState<State>('capture')
  const [photos,        setPhotos]        = useState<InspectionPhoto[]>([])
  const [primaryBlob,   setPrimaryBlob]   = useState<{ blob: Blob; type: string } | null>(null)
  const [voiceNote,     setVoiceNote]     = useState('')
  const [assessment,    setAssessment]    = useState<Inspection['aiAssessment']>(undefined)
  const [error,         setError]         = useState('')

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => { /* nothing — we use data URLs not blob URLs */ }
  }, [])

  if (!equipment) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/inventory')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
          <ChevronLeft className="w-4 h-4" /> Inventory
        </button>
        <p className="text-sm text-slate-500 dark:text-slate-400">Equipment not found.</p>
      </div>
    )
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    const photo: InspectionPhoto = {
      id:           crypto.randomUUID(),
      localDataUrl: dataUrl,
      takenAt:      new Date().toISOString(),
    }
    setPhotos(prev => [...prev, photo])
    setPrimaryBlob({ blob: file, type: file.type || 'image/jpeg' })
  }

  async function runAssessment() {
    if (!primaryBlob || !equipment) return
    setError('')
    setState('assessing')
    try {
      const result = await assessCondition({
        blob:      primaryBlob.blob,
        mimeType:  primaryBlob.type,
        equipment,
        category,
        voiceNote: voiceNote || undefined,
      })
      setAssessment(result)
      setState('reviewing')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setState('capture')
      toast.error(`Assessment failed: ${msg}`)
    }
  }

  function handleSave() {
    if (!equipment) return
    const inspection: Inspection = {
      id:           crypto.randomUUID(),
      propertyId:   equipment.propertyId,
      equipmentId:  equipment.id,
      categoryId:   equipment.categoryId,
      inspectedAt:  new Date().toISOString(),
      photos,
      voiceNoteTranscript: voiceNote || undefined,
      aiAssessment: assessment,
    }
    inspectionStore.add(inspection)
    toast.success('Inspection saved')
    navigate(`/equipment/${equipment.id}`)
  }

  function handleCreateTask() {
    if (!equipment || !assessment) return
    const inspection: Inspection = {
      id:           crypto.randomUUID(),
      propertyId:   equipment.propertyId,
      equipmentId:  equipment.id,
      categoryId:   equipment.categoryId,
      inspectedAt:  new Date().toISOString(),
      photos,
      voiceNoteTranscript: voiceNote || undefined,
      aiAssessment: assessment,
    }
    const taskId = `task_${Date.now()}`
    customTaskStore.add({
      id:          taskId,
      propertyId:  equipment.propertyId,
      title:       assessment.recommendedAction,
      systemLabel: category?.label ?? equipment.label,
      categoryId:  equipment.categoryId,
      dueDate:     dueDateFromUrgency(assessment.urgency),
      priority:    severityToPriority(assessment.severity),
      status:      'upcoming',
      source:      'ai-suggested',
      notes:       `Generated from inspection — ${assessment.summary}`,
    })
    inspection.linkedMaintenanceTaskId = taskId
    inspectionStore.add(inspection)
    toast.success('Maintenance task created')
    navigate('/maintenance')
  }

  return (
    <div className="space-y-5 pb-8">
      <button
        onClick={() => navigate(`/equipment/${equipment.id}`)}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        {equipment.label}
      </button>

      <div>
        <div className="flex items-center gap-2">
          {category && <span className="text-2xl">{category.icon}</span>}
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Inspect {equipment.label}</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {category?.label ?? equipment.categoryId}
          {equipment.installYear && ` · installed ${equipment.installYear}${equipment.age ? ` (${equipment.age}yr old)` : ''}`}
        </p>
      </div>

      {/* Capture */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Photo</h2>
          {!hasKey && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">Add OpenRouter key to enable AI assessment</span>
          )}
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
        <input ref={uploadRef} type="file" accept="image/*"                       className="hidden" onChange={e => handleFiles(e.target.files)} />

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={state === 'assessing'} className="btn btn-info"><Camera className="w-4 h-4" />Capture</button>
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={state === 'assessing'} className="btn btn-secondary"><Upload className="w-4 h-4" />Upload</button>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                <img src={p.localDataUrl} alt="Inspection" className="w-full aspect-square object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(prev => prev.filter(x => x.id !== p.id))}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice note */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Owner's note (optional)</h2>
          <VoiceMemoButton
            size="sm"
            contextHint={`${category?.label ?? ''} inspection`}
            onApply={(parsed) => setVoiceNote(parsed.workDone)}
          />
        </div>
        <textarea
          value={voiceNote}
          onChange={e => setVoiceNote(e.target.value)}
          rows={2}
          placeholder="What you noticed (visible damage, sounds, smells)…"
          className="w-full text-sm input-surface rounded-xl px-3 py-2"
        />
      </div>

      {/* Assess button */}
      {state === 'capture' && primaryBlob && hasKey && (
        <button
          onClick={runAssessment}
          className="w-full btn btn-primary"
        >
          <Sparkles className="w-4 h-4" />
          Run AI assessment
        </button>
      )}
      {state === 'capture' && primaryBlob && !hasKey && (
        <button
          onClick={handleSave}
          className="w-full btn btn-primary"
        >
          <Save className="w-4 h-4" />
          Save without assessment
        </button>
      )}

      {state === 'assessing' && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
          Analyzing photo and equipment context…
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Result */}
      {state === 'reviewing' && assessment && (
        <>
          <AiAssessmentCard assessment={assessment} />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleSave} className="btn">
              <Save className="w-4 h-4" />
              Save inspection
            </button>
            <button onClick={handleCreateTask} className="btn btn-primary">
              <Plus className="w-4 h-4" />
              Create task
            </button>
          </div>
        </>
      )}
    </div>
  )
}
