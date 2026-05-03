/**
 * AI parsing of a raw voice transcript into structured maintenance fields.
 *
 * Phase 3 §7 spec: a short conversational transcript ("Pressure tank,
 * drained and bled, took about 20 minutes") is cheap to parse — uses
 * `chatCompletion` with response_format json_schema. Falls back to the
 * raw transcript when no OpenRouter key is configured.
 */

import { chatCompletion } from '../services/openRouterClient'
import { getOpenRouterKey } from '../store/settings'

export interface ParsedVoiceMemo {
  /** Cleaned-up free-text description (always present). */
  workDone:        string
  /** Detected system / category keyword if mentioned, e.g. "pressure tank". */
  system?:         string
  /** Free-text duration if mentioned, e.g. "20 minutes". */
  duration?:       string
  /** Contractor / company if mentioned. */
  contractor?:     string
  /** Numeric cost if a dollar figure was mentioned. */
  cost?:           number
  /** True if the transcript implies a follow-up is needed. */
  followUpNeeded?: boolean
  /** Short follow-up note in the speaker's words. */
  followUpNote?:   string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    workDone:       { type: 'string' },
    system:         { type: 'string' },
    duration:       { type: 'string' },
    contractor:     { type: 'string' },
    cost:           { type: 'number' },
    followUpNeeded: { type: 'boolean' },
    followUpNote:   { type: 'string' },
  },
  required: ['workDone'],
}

const SYSTEM_PROMPT = `You are extracting structured fields from a maintenance voice memo.

Input: a short, conversational transcript captured while the property owner was working.
Output JSON keys:
- workDone: REQUIRED. A clean rewrite of the description in past tense, full sentences.
- system: equipment/system mentioned (e.g. "pressure tank", "HVAC filter"). Omit if none.
- duration: spoken duration (e.g. "20 minutes", "an hour"). Omit if none.
- contractor: company or person mentioned. Omit if none.
- cost: dollar amount mentioned, as a number (no $ sign). Omit if none.
- followUpNeeded: true ONLY if speaker explicitly says they need to revisit, recheck, or follow up.
- followUpNote: short paraphrase of the follow-up reason if followUpNeeded.

Be conservative — omit any field the speaker didn't actually mention.`

/**
 * Returns a parsed memo. Falls back to a raw-transcript-only result when:
 *   - no OpenRouter key is set, or
 *   - the transcript is empty, or
 *   - the API call throws.
 */
export async function parseVoiceMemo(
  transcript: string,
  contextHint?: string,
): Promise<ParsedVoiceMemo> {
  const trimmed = transcript.trim()
  if (!trimmed) return { workDone: '' }

  const apiKey = getOpenRouterKey()
  if (!apiKey) return { workDone: trimmed }

  const userMsg = contextHint
    ? `Context: ${contextHint}\n\nTranscript:\n${trimmed}`
    : `Transcript:\n${trimmed}`

  try {
    const result = await chatCompletion({
      apiKey,
      model: 'google/gemini-flash-1.5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMsg },
      ],
      maxTokens: 400,
      temperature: 0.1,
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'VoiceMemo', strict: true, schema: SCHEMA },
      },
    })

    const parsed = JSON.parse(result.content || '{}') as Partial<ParsedVoiceMemo>
    return {
      workDone:       parsed.workDone || trimmed,
      system:         parsed.system,
      duration:       parsed.duration,
      contractor:     parsed.contractor,
      cost:           typeof parsed.cost === 'number' ? parsed.cost : undefined,
      followUpNeeded: parsed.followUpNeeded === true,
      followUpNote:   parsed.followUpNote,
    }
  } catch {
    // Network / model failure — return the raw transcript so the user
    // still gets their words back rather than nothing.
    return { workDone: trimmed }
  }
}
