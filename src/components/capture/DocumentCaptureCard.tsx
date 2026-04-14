import { useState, useRef } from 'react'
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import type { ExtractionResult } from '../../lib/documentExtractor'

interface DocumentCaptureCardProps {
  /** Called with extracted fields on success */
  onExtracted:  (fields: ExtractionResult) => void
  /** Called on extraction error */
  onError?:     (message: string) => void
  /** Async function that runs AI extraction for this specific document type */
  extractFn:    (blob: Blob, mimeType: string) => Promise<ExtractionResult>
  label?:       string
  acceptPdf?:   boolean
  disabled?:    boolean
}

type CardState = 'idle' | 'extracting' | 'done' | 'error'

export function DocumentCaptureCard({
  onExtracted, onError, extractFn,
  label = 'Photograph or upload document',
  acceptPdf = true,
  disabled,
}: DocumentCaptureCardProps) {
  const [cardState, setCardState] = useState<CardState>('idle')
  const [preview,   setPreview]   = useState<string | null>(null)
  const [errorMsg,  setErrorMsg]  = useState('')

  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef  = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    setCardState('extracting')
    setErrorMsg('')

    try {
      const result = await extractFn(file, file.type || 'image/jpeg')
      setCardState('done')
      onExtracted(result)
    } catch (err) {
      const msg = String(err)
      setCardState('error')
      setErrorMsg(msg.replace('Error: ', ''))
      onError?.(msg)
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) processFile(file)
  }

  function clearCapture() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setCardState('idle')
    setErrorMsg('')
  }

  const accept = acceptPdf ? 'image/*,application/pdf' : 'image/*'

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
      <p className="text-xs font-medium text-slate-600">{label}</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || cardState === 'extracting'}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Capture
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          disabled={disabled || cardState === 'extracting'}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file" accept="image/*" capture="environment"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <input
        ref={uploadRef}
        type="file" accept={accept}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {preview && (
        <div className="relative">
          <img
            src={preview} alt="Document preview"
            className="w-full max-h-28 object-cover rounded-lg border border-slate-200"
          />
          <button
            type="button"
            onClick={clearCapture}
            className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {cardState === 'extracting' && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-sky-500 shrink-0" />
          Extracting from document…
        </div>
      )}
      {cardState === 'done' && (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Extraction complete — review fields below
        </div>
      )}
      {cardState === 'error' && (
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg || 'Could not extract — enter fields manually'}</span>
        </div>
      )}
    </div>
  )
}
