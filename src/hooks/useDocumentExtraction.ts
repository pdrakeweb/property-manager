import { useState, useRef, useCallback } from 'react'
import { getOpenRouterKey } from '../store/settings'

export type AIState = 'idle' | 'extracting' | 'done' | 'error'
export type Confidence = 'high' | 'medium' | 'low'

export interface ExtractedValue {
  value: string
  confidence: Confidence
}

export type ExtractionResult = Record<string, ExtractedValue>

export interface CapturedDoc {
  name: string
  blob: Blob
  preview: string
  mimeType: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function callExtraction(
  blob: Blob,
  mimeType: string,
  fieldIds: string[],
  prompt: string,
): Promise<ExtractionResult> {
  const apiKey = getOpenRouterKey()
  if (!apiKey) throw new Error('No OpenRouter API key configured in Settings')

  const base64 = await blobToBase64(blob)

  // Build JSON schema for structured output
  const properties: Record<string, object> = {}
  for (const id of fieldIds) {
    properties[id] = {
      type: 'object',
      properties: {
        value:      { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['value', 'confidence'],
      additionalProperties: false,
    }
  }
  const jsonSchema = {
    type: 'object',
    properties,
    required: fieldIds,
    additionalProperties: false,
  }

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'DocumentExtraction', strict: true, schema: jsonSchema },
      },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`OpenRouter error ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
  const text = data.choices?.[0]?.message?.content ?? '{}'
  return JSON.parse(text) as ExtractionResult
}

export function useDocumentExtraction(fieldIds: string[], prompt: string) {
  const [aiState,   setAiState]   = useState<AIState>('idle')
  const [extracted, setExtracted] = useState<ExtractionResult>({})
  const [aiError,   setAiError]   = useState('')
  const [docs,      setDocs]      = useState<CapturedDoc[]>([])

  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef  = useRef<HTMLInputElement>(null)

  const triggerExtraction = useCallback((blob: Blob, mimeType: string) => {
    setAiState('extracting')
    setAiError('')
    callExtraction(blob, mimeType, fieldIds, prompt)
      .then(result => {
        setExtracted(result)
        setAiState('done')
      })
      .catch(err => {
        setAiState('error')
        setAiError(String(err))
      })
  }, [fieldIds, prompt])

  const handleFilesChosen = useCallback((files: FileList | null, extractNow = true) => {
    if (!files || files.length === 0) return
    const newDocs: CapturedDoc[] = Array.from(files).map(file => ({
      name:     file.name || `doc_${Date.now()}`,
      blob:     file,
      preview:  URL.createObjectURL(file),
      mimeType: file.type || 'image/jpeg',
    }))
    setDocs(prev => [...prev, ...newDocs])
    if (extractNow && newDocs.length > 0) {
      triggerExtraction(newDocs[0].blob, newDocs[0].mimeType)
    }
  }, [triggerExtraction])

  function removeDoc(index: number) {
    setDocs(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearExtraction() {
    setExtracted({})
    setAiState('idle')
    setAiError('')
    setDocs(prev => { prev.forEach(d => URL.revokeObjectURL(d.preview)); return [] })
  }

  return {
    aiState, extracted, aiError, docs,
    cameraRef, uploadRef,
    handleFilesChosen, removeDoc, clearExtraction,
  }
}

/** Return the Tailwind ring classes for a given confidence level */
export function confidenceRing(confidence: Confidence | undefined): string {
  if (!confidence) return ''
  return {
    high:   'ring-2 ring-emerald-200 border-emerald-300',
    medium: 'ring-2 ring-amber-200 border-amber-300',
    low:    'ring-2 ring-red-200 border-red-300',
  }[confidence]
}
