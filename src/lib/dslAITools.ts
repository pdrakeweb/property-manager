/**
 * AI tool descriptor generator for DSL-declared records.
 *
 * Produces OpenRouter function-calling tool definitions from the record
 * registry. Each registered type with `def.ai.expose !== false` gets a
 * lookup tool that accepts an optional `id` or `query` argument.
 *
 * Mirrors the hand-written tools in `services/aiTools.ts` so DSL-managed
 * types drop into the existing tool-executor switch.
 */

import type { ChatTool } from '../services/openRouterClient'
import type { AnyRecordDefinition } from '../records/_framework'
import { allDefinitions } from '../records/registry'

function toolName(def: AnyRecordDefinition): string {
  return def.ai?.toolName ?? `get_${def.type}s`
}

function toolDescription(def: AnyRecordDefinition): string {
  if (def.ai?.description) return def.ai.description
  return `Look up ${def.pluralLabel.toLowerCase()} for the current property.`
}

/** Build a ChatTool from one RecordDefinition. */
export function buildAITool(def: AnyRecordDefinition): ChatTool {
  const searchable = def.ai?.searchable ?? []
  const searchDesc = searchable.length > 0
    ? `Full-text search across: ${searchable.join(', ')}.`
    : 'Full-text search across indexed fields.'

  return {
    type: 'function',
    function: {
      name:        toolName(def),
      description: toolDescription(def),
      parameters: {
        type: 'object',
        properties: {
          id:    { type: 'string', description: `Specific ${def.label} id. Omit to list all.` },
          query: { type: 'string', description: searchDesc },
        },
      },
    },
  }
}

/** Build all AI tools from registered definitions that opt into AI. */
export function buildAITools(): ChatTool[] {
  return allDefinitions()
    .filter(d => d.ai?.expose !== false)
    .map(buildAITool)
}

/** Map a tool name back to the definition that produced it. */
export function findDefForTool(name: string): AnyRecordDefinition | null {
  return allDefinitions().find(d => toolName(d) === name) ?? null
}

/**
 * Default matcher for a DSL tool. Given a record list, filter by id or
 * full-text query across the definition's searchable fields.
 */
export function filterRecordsForTool(
  def:     AnyRecordDefinition,
  records: Array<Record<string, unknown>>,
  args:    Record<string, unknown>,
): Array<Record<string, unknown>> {
  const id    = typeof args.id === 'string'    ? args.id    : undefined
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''

  if (id) return records.filter(r => r.id === id)
  if (!query) return records

  const fields = def.ai?.searchable ?? ['id']
  return records.filter(r => fields.some(f => {
    const v = r[f]
    return v != null && String(v).toLowerCase().includes(query)
  }))
}
