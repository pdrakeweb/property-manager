/**
 * Guided Checklist runner — fullscreen step-by-step (Phase 3 §3).
 *
 * Reachable at `/checklists/:runId/guided`. Drives the same
 * `ChecklistRun` data as the list-mode `ChecklistRunScreen` but layers
 * one-step-at-a-time UI on top:
 *   - large step title + detail
 *   - TTS read-aloud button (when supported)
 *   - photo capture/upload (per-step)
 *   - notes textarea
 *   - per-step elapsed-time tracking via `startedAt`/`durationSeconds`
 *   - sessionStorage resume key so app close mid-flow resumes at the
 *     correct step
 *
 * On completion: shows a summary with total duration + per-step times.
 * PDF generation + Drive upload are a follow-up batch.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, X, Volume2, VolumeX, Camera, Upload,
  Check, SkipForward, CheckCircle2, Clock, Printer, Download, Mail,
} from 'lucide-react'
import { cn } from '../utils/cn'
import {
  checklistRunStore, getResolvedItems, updateRunItem, completeRun,
} from '../lib/checklistStore'
import { findTemplate } from '../lib/checklistTemplateStore'
import { propertyStore } from '../lib/propertyStore'
import { isSpeechSynthesisSupported, speak, stopSpeaking } from '../lib/ttsService'
import { useToast } from '../components/Toast'
import { useModalA11y } from '../lib/focusTrap'
import type {
  ChecklistRun, ChecklistRunItem, ChecklistRunPhoto, ChecklistItem,
} from '../types/checklist'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const SESSION_KEY = 'pm_guided_checklist_session'

interface SessionState {
  runId:      string
  itemIndex:  number
  ttsEnabled: boolean
}

function readSession(runId: string): SessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionState
    if (parsed.runId !== runId) return null
    return parsed
  } catch { return null }
}

function writeSession(state: SessionState): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

// ── Confirm exit modal ──────────────────────────────────────────────────────

function ConfirmExitModal({ onCancel, onLeave, onSavePause }: {
  onCancel:    () => void
  onLeave:     () => void
  onSavePause: () => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel)
  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-guided-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <h2 id="leave-guided-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Leave guided run?</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Your progress on this step is saved. Use "Pause" to keep the session resumable; "Leave" discards the resume marker but keeps any saved item state.</p>
        <div className="flex gap-2">
          <button onClick={onCancel}    className="btn flex-1">Stay</button>
          <button onClick={onSavePause} className="btn">Pause</button>
          <button onClick={onLeave}     className="btn btn-secondary">Leave</button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function ChecklistGuidedScreen() {
  const { runId = '' } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoCameraRef = useRef<HTMLInputElement>(null)

  // ── Load run + items ──────────────────────────────────────────────────────
  const run = useMemo<ChecklistRun | undefined>(() => checklistRunStore.getById(runId), [runId])
  const property = run ? propertyStore.getById(run.propertyId) : undefined
  const template = run ? findTemplate(run.templateId) : undefined
  const items: ChecklistItem[] = useMemo(() => {
    if (!run || !property || !template) return []
    return getResolvedItems(run.propertyId, run.templateId, property.type)
      .filter(it => run.items.some(ri => ri.itemId === it.id))
  }, [run, property, template])

  // ── State ────────────────────────────────────────────────────────────────
  const [itemIndex, setItemIndex] = useState(0)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [stepStartedAt, setStepStartedAt] = useState<number>(() => Date.now())
  const [showExit, setShowExit] = useState(false)
  // Local state for the step's note + photos, written into the run on advance.
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<ChecklistRunPhoto[]>([])

  // Resume from session storage on mount.
  useEffect(() => {
    const session = readSession(runId)
    if (!session || !run) return
    if (session.itemIndex < items.length) {
      setItemIndex(session.itemIndex)
      setTtsEnabled(session.ttsEnabled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // Pull the current ChecklistRunItem from the run, if any.
  const currentItem = items[itemIndex]
  const currentRunItem: ChecklistRunItem | undefined = useMemo(
    () => run?.items.find(ri => ri.itemId === currentItem?.id),
    [run, currentItem],
  )

  // When the step changes, reset note/photos from the current run-item state and
  // capture a new step start time.
  useEffect(() => {
    setNote(currentRunItem?.note ?? '')
    setPhotos(currentRunItem?.photos ?? [])
    setStepStartedAt(Date.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIndex, currentItem?.id])

  // Persist resume state on each step change.
  useEffect(() => {
    if (run) writeSession({ runId, itemIndex, ttsEnabled })
  }, [run, runId, itemIndex, ttsEnabled])

  // Auto-speak when TTS is enabled and the step changes.
  useEffect(() => {
    if (!ttsEnabled || !currentItem) return
    const text = [currentItem.label, currentItem.detail].filter(Boolean).join('. ')
    const stop = speak(text, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false), onError: () => setSpeaking(false) })
    return () => { stop(); setSpeaking(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled, currentItem?.id])

  // Stop speaking on unmount.
  useEffect(() => () => stopSpeaking(), [])

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!runId) {
    return <div className="p-4 text-sm text-slate-500">Missing run id.</div>
  }
  if (!run || !property) {
    return (
      <div className="p-4 space-y-3">
        <button onClick={() => navigate('/checklists')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ChevronLeft className="w-4 h-4" /> Checklists</button>
        <p className="text-sm text-slate-500 dark:text-slate-400">Checklist run not found.</p>
      </div>
    )
  }
  if (run.completedAt) {
    return (
      <CompletionSummary run={run} onClose={() => { clearSession(); navigate('/checklists') }} />
    )
  }
  if (items.length === 0 || !currentItem || !currentRunItem) {
    return (
      <div className="p-4 space-y-3">
        <button onClick={() => navigate('/checklists')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ChevronLeft className="w-4 h-4" /> Checklists</button>
        <p className="text-sm text-slate-500 dark:text-slate-400">No steps available — this checklist may be empty for this property type.</p>
      </div>
    )
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function persistCurrent(patch: Partial<ChecklistRunItem>): void {
    if (!currentItem) return
    const elapsed = Math.max(0, Math.round((Date.now() - stepStartedAt) / 1000))
    const baseStartedAt = currentRunItem?.startedAt ?? new Date(stepStartedAt).toISOString()
    const baseDuration  = currentRunItem?.durationSeconds ?? 0
    updateRunItem(runId, currentItem.id, {
      note:      note || undefined,
      photos,
      startedAt: baseStartedAt,
      durationSeconds: baseDuration + elapsed,
      ...patch,
    })
  }

  function markDoneAndAdvance() {
    persistCurrent({ done: true, skipped: false, completedAt: new Date().toISOString() })
    advance()
  }

  function skipAndAdvance() {
    persistCurrent({ skipped: true, done: false, completedAt: new Date().toISOString() })
    advance()
  }

  function saveAndAdvance() {
    // Default action when user just hits "Next" without explicit done.
    persistCurrent({})
    advance()
  }

  function advance() {
    stopSpeaking()
    if (itemIndex >= items.length - 1) {
      // All steps done.
      completeRun(runId)
      clearSession()
      toast.success('Checklist complete')
      // Force re-render to show CompletionSummary.
      setItemIndex(itemIndex + 1)
      return
    }
    setItemIndex(i => i + 1)
  }

  function back() {
    if (itemIndex === 0) return
    persistCurrent({})
    stopSpeaking()
    setItemIndex(i => i - 1)
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const newPhotos: ChecklistRunPhoto[] = []
    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file)
      newPhotos.push({ id: crypto.randomUUID(), localDataUrl: dataUrl, takenAt: new Date().toISOString() })
    }
    setPhotos(prev => [...prev, ...newPhotos])
  }

  function removePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  // ── Header / progress ───────────────────────────────────────────────────
  const totalSteps   = items.length
  const doneCount    = run.items.filter(i => i.done).length
  const skippedCount = run.items.filter(i => i.skipped).length
  const ttsSupport   = isSpeechSynthesisSupported()

  return (
    <div className="space-y-5 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setShowExit(true)} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Close guided run">
          <X className="w-4 h-4" />
          Exit
        </button>
        <div className="flex items-center gap-2">
          {ttsSupport && (
            <button
              type="button"
              onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(t => !t) }}
              aria-pressed={ttsEnabled}
              aria-label={ttsEnabled ? 'Disable read-aloud' : 'Enable read-aloud'}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                ttsEnabled
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
              )}
            >
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {ttsEnabled ? (speaking ? 'Speaking…' : 'TTS on') : 'TTS off'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
          <span>Step {itemIndex + 1} of {totalSteps}</span>
          <span>{doneCount} done · {skippedCount} skipped</span>
        </div>
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${Math.round(((itemIndex + 1) / totalSteps) * 100)}%` }}
          />
        </div>
      </div>

      {/* Step card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{currentItem.category}</p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{currentItem.label}</h2>
          {currentItem.estimatedMinutes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ~{currentItem.estimatedMinutes} min
            </p>
          )}
        </div>

        {currentItem.detail && (
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{currentItem.detail}</p>
        )}

        {/* Photos */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Photos</p>
          <div className="flex gap-2 mb-2">
            <button onClick={() => photoCameraRef.current?.click()} className="btn btn-info"><Camera className="w-3.5 h-3.5" />Capture</button>
            <button onClick={() => photoInputRef.current?.click()}  className="btn btn-secondary"><Upload className="w-3.5 h-3.5" />Upload</button>
          </div>
          <input ref={photoCameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
          <input ref={photoInputRef}  type="file" accept="image/*"                       multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(p => (
                <div key={p.id} className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={p.localDataUrl} alt="Step photo" className="w-full aspect-square object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
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

        {/* Notes */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Notes (optional)</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Anything noteworthy about this step…"
            className="w-full text-sm input-surface rounded-xl px-3 py-2"
          />
        </div>

        {/* Action row */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button onClick={skipAndAdvance} className="btn btn-secondary"><SkipForward className="w-3.5 h-3.5" />Skip</button>
          <div className="flex-1" />
          <button onClick={saveAndAdvance} className="btn"><ChevronRight className="w-3.5 h-3.5" />Next</button>
          <button onClick={markDoneAndAdvance} className="btn btn-primary"><Check className="w-3.5 h-3.5" />Done & next</button>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <button
          onClick={back}
          disabled={itemIndex === 0}
          className="inline-flex items-center gap-1 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous step
        </button>
        <span className="tabular-nums">{template?.name ?? run.name ?? 'Checklist'}</span>
      </div>

      {showExit && (
        <ConfirmExitModal
          onCancel={() => setShowExit(false)}
          onSavePause={() => { persistCurrent({}); navigate('/checklists') }}
          onLeave={() => { clearSession(); navigate('/checklists') }}
        />
      )}
    </div>
  )
}

// ── Completion summary ──────────────────────────────────────────────────────

function buildMarkdownReport(args: {
  run: ChecklistRun
  property: ReturnType<typeof propertyStore.getById>
  templateName: string
  items: ChecklistItem[]
  elapsedSec: number
}): string {
  const { run, property, templateName, items, elapsedSec } = args
  const lines: string[] = []
  lines.push(`# ${templateName}`)
  lines.push('')
  lines.push(`**Property:** ${property?.name ?? property?.shortName ?? run.propertyId}`)
  if (property?.address) lines.push(`**Address:** ${property.address}`)
  lines.push(`**Date:** ${run.completedAt ? new Date(run.completedAt).toLocaleString() : new Date().toLocaleString()}`)
  lines.push(`**Duration:** ${formatDuration(elapsedSec)}`)
  const done    = run.items.filter(i => i.done).length
  const skipped = run.items.filter(i => i.skipped).length
  lines.push(`**Items:** ${done} done · ${skipped} skipped · ${run.items.length} total`)
  lines.push('')
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const ri = run.items.find(x => x.itemId === it.id)
    if (!ri) continue
    const status =
      ri.done    ? '✅ Done' :
      ri.skipped ? '➖ Skipped' :
                   '⚠️ Untouched'
    const dur = ri.durationSeconds != null ? ` (${formatDuration(ri.durationSeconds)})` : ''
    lines.push(`## Step ${i + 1} — ${it.label}`)
    lines.push(`*${it.category} · ${status}${dur}*`)
    if (it.detail) { lines.push(''); lines.push(`> ${it.detail.split('\n').join('\n> ')}`) }
    if (ri.note)   { lines.push(''); lines.push(`**Notes:** ${ri.note}`) }
    if ((ri.photos?.length ?? 0) > 0) {
      lines.push('')
      lines.push(`**Photos:** ${ri.photos!.length} attached`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function CompletionSummary({ run, onClose }: { run: ChecklistRun; onClose: () => void }) {
  const total = run.items.length
  const done    = run.items.filter(i => i.done).length
  const skipped = run.items.filter(i => i.skipped).length
  const elapsed = run.completedAt && run.startedAt
    ? Math.max(0, Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))
    : run.items.reduce((a, i) => a + (i.durationSeconds ?? 0), 0)
  const property = propertyStore.getById(run.propertyId)
  const template = findTemplate(run.templateId)
  const items = property && template
    ? getResolvedItems(run.propertyId, run.templateId, property.type)
    : []
  const templateName = template?.name ?? run.name ?? 'Checklist'

  function handlePrint() {
    window.print()
  }

  function handleDownloadMd() {
    const md = buildMarkdownReport({ run, property, templateName, items, elapsedSec: elapsed })
    const date = (run.completedAt ?? new Date().toISOString()).slice(0, 10)
    const slug = templateName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
    downloadBlob(new Blob([md], { type: 'text/markdown' }), `${slug}_${date}.md`)
  }

  function handleEmail() {
    const subject = `${templateName} — ${property?.shortName ?? property?.name ?? 'Property'} ${(run.completedAt ?? '').slice(0, 10)}`
    const md = buildMarkdownReport({ run, property, templateName, items, elapsedSec: elapsed })
    // mailto: bodies have a soft limit (~2 KB on most clients); truncate generously.
    const body = md.length > 1800 ? md.slice(0, 1800) + '\n\n…(truncated — see attached or in-app for full report)' : md
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <div data-print-root className="space-y-5 pb-8 max-w-2xl mx-auto">
      <div className="text-center py-6">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto no-print" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">Checklist complete</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {templateName} · {property?.shortName ?? property?.name ?? ''}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
          {done} of {total} done · {skipped} skipped · {formatDuration(elapsed)} total
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-2 justify-center">
        <button onClick={handlePrint}      className="btn"><Printer  className="w-3.5 h-3.5" />Save as PDF (print)</button>
        <button onClick={handleDownloadMd} className="btn"><Download className="w-3.5 h-3.5" />Download .md</button>
        <button onClick={handleEmail}      className="btn"><Mail     className="w-3.5 h-3.5" />Share by email</button>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden">
        {items.map((it, i) => {
          const ri = run.items.find(x => x.itemId === it.id)
          if (!ri) return null
          const status =
            ri.done    ? 'Done' :
            ri.skipped ? 'Skipped' :
                         'Untouched'
          const statusColor =
            ri.done    ? 'text-emerald-600 dark:text-emerald-400' :
            ri.skipped ? 'text-slate-500 dark:text-slate-400' :
                         'text-amber-600 dark:text-amber-400'
          return (
            <div key={it.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">Step {i + 1} · {it.category}</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{it.label}</p>
                  {ri.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-wrap">{ri.note}</p>}
                  {(ri.photos?.length ?? 0) > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {ri.photos!.map(p => (
                        <img key={p.id} src={p.localDataUrl} alt="" className="rounded border border-slate-200 dark:border-slate-700 w-full aspect-square object-cover" />
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-xs font-semibold', statusColor)}>{status}</p>
                  {ri.durationSeconds != null && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{formatDuration(ri.durationSeconds)}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={onClose} className="btn btn-primary w-full no-print">Back to checklists</button>
    </div>
  )
}

