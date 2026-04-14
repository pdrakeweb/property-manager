/**
 * Shared document extraction utility.
 * Calls OpenRouter vision model and returns structured field values.
 * Used by DocumentCaptureCard and any screen that needs AI extraction.
 */

export interface ExtractedField {
  value: string
  confidence: 'high' | 'medium' | 'low'
}
export type ExtractionResult = Record<string, ExtractedField>

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function extractDocument(
  blob: Blob,
  mimeType: string,
  fieldIds: string[],
  prompt: string,
): Promise<ExtractionResult> {
  const apiKey = localStorage.getItem('openrouter_api_key')
  if (!apiKey) throw new Error('No OpenRouter API key — configure one in Settings')

  const base64 = await blobToBase64(blob)

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

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name:   'DocumentExtraction',
          strict: true,
          schema: {
            type: 'object',
            properties,
            required: fieldIds,
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Extraction failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as ExtractionResult
}

/** Tailwind ring classes for confidence level */
export function confidenceRing(confidence: 'high' | 'medium' | 'low' | undefined): string {
  if (!confidence) return ''
  return {
    high:   'ring-2 ring-emerald-200 border-emerald-300',
    medium: 'ring-2 ring-amber-200 border-amber-300',
    low:    'ring-2 ring-red-200 border-red-300',
  }[confidence]
}
