/**
 * Cross-record full-text search over `localIndex`.
 *
 * Each record type declares `ai.searchable` (string[]) on its DSL
 * definition; this service walks every registered type for a given
 * property and ranks results by:
 *   - title match (highest weight, +5 per query token)
 *   - searchable-field match (+2 per token)
 *   - any-other-field substring match (+1 per token)
 *
 * Phase 3 §4 originally specified hitting Drive's `/files` search API;
 * the local index already contains every record (push + pull keep it
 * in sync), so an offline search here gives instant results without a
 * network round-trip and works in the dev_token bypass too.
 */

import { localIndex } from './localIndex'
import type { IndexRecord } from './localIndex'
import { allDefinitions, isRegistered } from '../records/registry'
import type { AnyRecordDefinition } from '../records/_framework'

export interface SearchResult {
  /** The record type, e.g. "permit", "capital_item". */
  type:    string
  /** Human-readable label for the record type, e.g. "Permit". */
  typeLabel: string
  /** The raw IndexRecord, in case the consumer needs full data. */
  record:  IndexRecord
  /** Display title (always non-empty). */
  title:   string
  /** ~120-char snippet showing where the query matched. */
  snippet: string
  /** Hash route to navigate to (e.g. "#/equipment/abc-123"). */
  href:    string
  /** Higher = better match. */
  score:   number
}

interface DefIndex {
  [type: string]: AnyRecordDefinition
}

let defCache: DefIndex | null = null
function getDefIndex(): DefIndex {
  if (defCache) return defCache
  const out: DefIndex = {}
  for (const def of allDefinitions()) out[def.type] = def
  defCache = out
  return out
}

/**
 * Map a record to the route that shows it in detail. Records without
 * a dedicated detail screen route to the list screen for that type.
 */
function recordHref(type: string, record: IndexRecord): string {
  switch (type) {
    case 'equipment':           return `#/equipment/${record.id}`
    case 'task':                return '#/maintenance'
    case 'completed_event':     return '#/maintenance'
    case 'vendor':              return '#/vendors'
    case 'well_test':           return '#/well-tests'
    case 'capital_item':        return '#/budget'
    case 'capital_transaction': return '#/budget'
    case 'capital_override':    return '#/budget'
    case 'fuel_delivery':       return '#/fuel'
    case 'septic_event':        return '#/septic-log'
    case 'tax_assessment':      return '#/tax'
    case 'tax_payment':         return '#/tax'
    case 'mortgage':            return '#/mortgage'
    case 'mortgage_payment':    return '#/mortgage'
    case 'utility_account':     return '#/utilities'
    case 'utility_bill':        return '#/utilities'
    case 'insurance':           return '#/insurance'
    case 'permit':              return '#/permits'
    case 'road':                return '#/road'
    case 'generator_log':       return '#/generator'
    case 'property':            return '#/settings'
    default:                    return '#/'
  }
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).map(s => s.trim()).filter(Boolean)
}

function scoreText(text: string | undefined, tokens: string[], weight: number): number {
  if (!text) return 0
  const lower = text.toLowerCase()
  let score = 0
  for (const t of tokens) if (lower.includes(t)) score += weight
  return score
}

function buildSnippet(record: IndexRecord, def: AnyRecordDefinition | undefined, tokens: string[]): string {
  const data = (record.data ?? {}) as Record<string, unknown>
  // Prefer DSL-supplied summary if available.
  if (def?.summary) {
    try {
      const s = def.summary(data as never)
      if (s && typeof s === 'string') return s.slice(0, 140)
    } catch { /* fall through */ }
  }
  // Otherwise: find the searchable field whose value contains a query token, return up to 120 chars around it.
  const fields = def?.ai?.searchable ?? []
  for (const f of fields) {
    const val = data[f]
    if (typeof val === 'string' && val) {
      const lower = val.toLowerCase()
      for (const t of tokens) {
        const i = lower.indexOf(t)
        if (i >= 0) {
          const start = Math.max(0, i - 40)
          const end   = Math.min(val.length, i + t.length + 80)
          return (start > 0 ? '…' : '') + val.slice(start, end) + (end < val.length ? '…' : '')
        }
      }
      if (val) return val.slice(0, 120)
    }
  }
  // Fallback: any string-valued field on data
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v) return v.slice(0, 120)
  }
  return ''
}

export function searchAllRecords(query: string, propertyId: string, limit = 50): SearchResult[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const defs = getDefIndex()
  const records = localIndex.getAllForProperty(propertyId)
  const out: SearchResult[] = []

  for (const r of records) {
    if (!isRegistered(r.type)) continue
    const def = defs[r.type]
    const data = (r.data ?? {}) as Record<string, unknown>

    // Title score
    let score = scoreText(r.title, tokens, 5)

    // Searchable fields
    for (const f of def.ai?.searchable ?? []) {
      const v = data[f]
      if (typeof v === 'string') score += scoreText(v, tokens, 2)
    }

    // Generic fallback: scan any other string fields lightly
    if (score === 0) {
      for (const v of Object.values(data)) {
        if (typeof v === 'string') {
          score += scoreText(v, tokens, 1)
          if (score > 0) break
        }
      }
    }

    if (score === 0) continue

    out.push({
      type:    r.type,
      typeLabel: def.label,
      record:  r,
      title:   r.title || def.label,
      snippet: buildSnippet(r, def, tokens),
      href:    recordHref(r.type, r),
      score,
    })
  }

  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}
