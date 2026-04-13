import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera, Upload, Sparkles, CheckCircle2, AlertCircle,
  Loader2, X, ChevronLeft, Cloud, Image as ImageIcon, WifiOff,
} from 'lucide-react'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { cn } from '../utils/cn'
import { PROPERTIES } from '../data/mockData'
import { getCategoryById, type CaptureCategory } from '../data/categories'
import { getValidToken } from '../auth/oauth'
import { DriveClient } from '../lib/driveClient'
import { formatFileStem, formatRecord } from '../lib/markdownFormatter'
import { enqueue } from '../lib/offlineQueue'

// ── Zod schema for AI extraction ─────────────────────────────────────────────

const ExtractedField = z.object({
  value:      z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
})
const NameplateExtractionSchema = z.record(z.string(), ExtractedField)
type ExtractionResult = z.infer<typeof NameplateExtractionSchema>

// ── AI extraction helpers ─────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function extractNameplate(
  photo: Blob,
  mimeType: string,
  fieldIds: string[],
  nameplatePrompt?: string,
): Promise<ExtractionResult> {
  const apiKey = localStorage.getItem('openrouter_api_key')
  if (!apiKey) throw new Error('No OpenRouter API key — add it in Settings')

  const base64 = await blobToBase64(photo)

  const systemPrompt = nameplatePrompt
    ?? `Extract equipment nameplate data from the image. Return only fields you can read clearly. Field IDs to extract: ${fieldIds.join(', ')}.`

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'nameplate_extraction',
          schema: zodToJsonSchema(NameplateExtractionSchema),
          strict: true,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenRouter error (${resp.status}): ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from AI')

  return NameplateExtractionSchema.parse(JSON.parse(content))
}

// ── Photo capture state ──────────────────────────────────────────────────────

interface CapturedPhoto {
  name:     string
  blob:     Blob
  preview:  string // object URL for display
}

// ── Component ────────────────────────────────────────────────────────────────

type AIState   = 'idle' | 'extracting' | 'done' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

export function EquipmentFormScreen() {
  const { categoryId = 'generator' } = useParams<{ categoryId: string }>()
  const navigate = useNavigate()

  const category = getCategoryById(categoryId)
  const fields   = category?.fields ?? []

  const [aiState,      setAiState]      = useState<AIState>('idle')
  const [aiExtracted,  setAiExtracted]  = useState<ExtractionResult>({})
  const [values,       setValues]       = useState<Record<string, string>>({})
  const [photos,       setPhotos]       = useState<CapturedPhoto[]>([])
  const [saveState,    setSaveState]    = useState<SaveState>('idle')
  const [saveError,    setSaveError]    = useState('')
  const [driveLink,    setDriveLink]    = useState('')

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Read active property from localStorage (set by AppShell property switcher)
  const activePropertyId = localStorage.getItem('active_property_id') ?? 'tannerville'
  const activeProperty   = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]

  // ── Photo handlers ─────────────────────────────────────────────────────────

  const handleFilesChosen = useCallback((files: FileList | null, _isCamera: boolean) => {
    if (!files || files.length === 0) return
    const newPhotos: CapturedPhoto[] = []
    for (const file of Array.from(files)) {
      newPhotos.push({
        name:    file.name || `photo_${Date.now()}.jpg`,
        blob:    file,
        preview: URL.createObjectURL(file),
      })
    }
    setPhotos(prev => [...prev, ...newPhotos])

    if (!category?.hasAIExtraction) return
    const firstPhoto = Array.from(files)[0]
    if (!firstPhoto) return

    setAiState('extracting')
    setSaveError('')

    void extractNameplate(firstPhoto, firstPhoto.type || 'image/jpeg', fields.map(f => f.id), category.nameplatePrompt)
      .then(extracted => {
        setAiExtracted(extracted)
        setValues(prev => {
          const next = { ...prev }
          for (const [id, ef] of Object.entries(extracted)) {
            if (ef?.value) next[id] = ef.value
          }
          return next
        })
        setAiState('done')
      })
      .catch(err => {
        setAiState('error')
        setSaveError(String(err))
      })
  }, [category, fields])

  function removePhoto(index: number) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  // ── Save to Drive ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveState('saving')
    setSaveError('')

    const capturedAt = new Date()
    const cat: CaptureCategory = category ?? {
      id: categoryId, label: categoryId, icon: '', description: '',
      propertyTypes: [], hasAIExtraction: false,
      allowMultiple: true, fields: [],
    }
    const fileStem   = formatFileStem(cat, values, capturedAt)
    const mdFilename = `${fileStem}.md`
    const mdContent  = formatRecord(
      cat,
      values,
      photos.map(p => p.name),
      capturedAt,
    )

    try {
      const token = await getValidToken()

      if (!token) {
        // Offline: queue the MD record (photos can't be queued as blobs)
        enqueue({
          categoryId,
          rootFolderId: activeProperty.driveRootFolderId,
          filename:     mdFilename,
          mdContent,
          capturedAt:   capturedAt.toISOString(),
        })
        setSaveState('offline')
        return
      }

      const folderId = await DriveClient.resolveFolderId(token, categoryId, activeProperty.driveRootFolderId)

      // Upload the markdown record first
      const mdFile = await DriveClient.uploadFile(token, folderId, mdFilename, mdContent, 'text/markdown')
      setDriveLink(`https://drive.google.com/file/d/${mdFile.id}/view`)

      // Upload each photo
      for (const photo of photos) {
        const ext      = photo.name.split('.').pop() ?? 'jpg'
        const photoName = `${fileStem}_${photo.name}`
        const mime      = photo.blob.type || `image/${ext}`
        await DriveClient.uploadFile(token, folderId, photoName, photo.blob, mime)
      }

      setSaveState('saved')

      // Navigate back after 2s
      setTimeout(() => navigate('/capture'), 2000)

    } catch (err) {
      // Upload failed — queue the MD for later
      enqueue({
        categoryId,
        rootFolderId: activeProperty.driveRootFolderId,
        filename:     mdFilename,
        mdContent,
        capturedAt:   capturedAt.toISOString(),
      })
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
        <h2 className="text-xl font-bold text-slate-900 mb-2">Saved to Drive</h2>
        <p className="text-sm text-slate-500 mb-1">
          Record uploaded to {category?.label ?? categoryId} folder
        </p>
        <p className="text-xs text-slate-400 mb-4">
          {category?.icon} {values['brand'] || 'Equipment'} {values['model'] || ''} · {new Date().toLocaleDateString()}
        </p>
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-600 hover:text-sky-700 underline mb-6"
          >
            View in Drive ↗
          </a>
        )}
        <p className="text-xs text-slate-400 mb-6">Returning to Capture…</p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors">
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
        <h2 className="text-xl font-bold text-slate-900 mb-2">Saved Offline</h2>
        <p className="text-sm text-slate-500 mb-1">Record queued — will upload when connected.</p>
        {saveError && <p className="text-xs text-slate-400 mb-4 max-w-xs">{saveError}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors">
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
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {category?.icon} {category?.label ?? categoryId}
          </h1>
          <p className="text-xs text-slate-500">New record · {activeProperty.shortName}</p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, true)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, false)}
      />

      {/* Photo Capture Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Photograph Nameplate</h2>
            {category?.hasAIExtraction && (
              <span className="flex items-center gap-1 text-xs text-sky-600">
                <Sparkles className="w-3 h-3" />
                AI extraction
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={aiState === 'extracting'}
              className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Camera
            </button>
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>

          {/* AI status banner */}
          {aiState !== 'idle' && (
            <div className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm',
              aiState === 'extracting' && 'bg-sky-50 text-sky-700',
              aiState === 'done'       && 'bg-emerald-50 text-emerald-700',
              aiState === 'error'      && 'bg-red-50 text-red-700',
            )}>
              {aiState === 'extracting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {aiState === 'done'       && <CheckCircle2 className="w-4 h-4" />}
              {aiState === 'error'      && <AlertCircle className="w-4 h-4" />}
              <span className="font-medium">
                {aiState === 'extracting' && 'Extracting specifications…'}
                {aiState === 'done'       && 'Extraction complete — review below'}
                {aiState === 'error'      && <span className="font-medium">Extraction failed — {saveError || 'fill manually'}</span>}
              </span>
            </div>
          )}

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {photos.map((p, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded-lg border border-slate-200 overflow-hidden group bg-slate-100"
                >
                  <img src={p.preview} alt={p.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 text-white rounded-full items-center justify-center hidden group-hover:flex text-xs leading-none"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="w-16 h-16 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Equipment Details</h2>
          {aiState === 'done' && (
            <p className="text-xs text-slate-500 mt-0.5">Fields highlighted by AI confidence — emerald=high, amber=medium, red=low. Please verify.</p>
          )}
        </div>
        <div className="p-4 space-y-4">
          {fields.map(field => {
            const val        = values[field.id] ?? ''
            const confidence = aiExtracted[field.id]?.confidence
            const aiFilledStyle = confidence
              ? confidence === 'high'   ? 'ring-2 ring-emerald-200 border-emerald-300'
              : confidence === 'medium' ? 'ring-2 ring-amber-200 border-amber-300'
              :                           'ring-2 ring-red-200 border-red-300'
              : ''
            const baseClass = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition-all placeholder:text-slate-400'

            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {field.label}
                  {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
                  {confidence && (
                    <span className={cn(
                      'ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                      confidence === 'high'   ? 'text-emerald-700 bg-emerald-50'
                      : confidence === 'medium' ? 'text-amber-700 bg-amber-50'
                      :                           'text-red-700 bg-red-50',
                    )}>
                      AI {confidence}
                    </span>
                  )}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'resize-none', aiFilledStyle)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={val}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'bg-white', aiFilledStyle)}
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
                      className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                    />
                    <span className="text-sm text-slate-600">Yes</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, aiFilledStyle)}
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
          className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="flex-[2] py-3.5 rounded-2xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:bg-sky-400 transition-colors flex items-center justify-center gap-2"
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
