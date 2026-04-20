/**
 * AI Tool definitions and execution handlers.
 *
 * These tools are exposed to the LLM via OpenRouter function calling.
 * Each tool queries the PropertyRecordsAPI rather than accessing Drive directly.
 */

import type { ChatTool } from './openRouterClient'
import type { PropertyRecordsAPI } from './PropertyRecordsAPI'

// ─── Tool definitions (JSON Schema for OpenRouter) ─────────────────────────────

export const AI_TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_records',
      description: 'Search across all property records (equipment, maintenance, capital, service) by keyword. Use this to find specific systems, tasks, or history.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keyword (e.g. "generator", "HVAC", "Rheem", "Buckeye")',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equipment',
      description: 'Get detailed equipment records. Omit id to list all equipment for the property. Provide id to get full details for a specific piece of equipment including related files.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Equipment record ID (e.g. "gen-001"). Omit to list all.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_maintenance',
      description: 'Get maintenance tasks for the property. Can filter by status (overdue, due, upcoming, completed) and/or category.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['overdue', 'due', 'upcoming', 'completed'],
            description: 'Filter by task status',
          },
          category: {
            type: 'string',
            description: 'Filter by category ID (e.g. "hvac", "generator", "septic")',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_capital_forecast',
      description: 'Get capital replacement forecast items. Can filter by priority (critical, high, medium, low) and/or target year.',
      parameters: {
        type: 'object',
        properties: {
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: 'Filter by priority level',
          },
          year: {
            type: 'number',
            description: 'Filter by estimated replacement year',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_service_history',
      description: 'Get past service records. Can filter by system name and/or date range.',
      parameters: {
        type: 'object',
        properties: {
          system: {
            type: 'string',
            description: 'Filter by system label (e.g. "Generator", "HVAC Main", "Propane")',
          },
          after_date: {
            type: 'string',
            description: 'Only records after this date (YYYY-MM-DD)',
          },
          before_date: {
            type: 'string',
            description: 'Only records before this date (YYYY-MM-DD)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ha_status',
      description: 'Get current Home Assistant sensor readings for the property (propane level, generator status, well pressure, etc.)',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full content of a specific file from Google Drive. Only use this when you need deeper detail than what the record summary provides. You must provide a reason explaining why the additional detail is needed.',
      parameters: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'The Drive file ID to read',
          },
          reason: {
            type: 'string',
            description: 'Why you need to read this file (e.g. "Need full spec details for replacement quote")',
          },
        },
        required: ['file_id', 'reason'],
      },
    },
  },
]

// ─── Tool execution handler ────────────────────────────────────────────────────

/**
 * Creates a tool executor function bound to a PropertyRecordsAPI instance.
 * This is passed to `chatWithTools()` to handle tool calls from the LLM.
 */
export function createToolExecutor(api: PropertyRecordsAPI) {
  return async function executeToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case 'search_records': {
        const query = String(args.query ?? '')
        const results = api.searchRecords(query)
        if (results.length === 0) return JSON.stringify({ results: [], message: `No records found matching "${query}"` })
        return JSON.stringify({ results, count: results.length })
      }

      case 'get_equipment': {
        const id = args.id as string | undefined
        const result = api.getEquipment(id)
        if (id && !result) return JSON.stringify({ error: `Equipment record "${id}" not found` })
        return JSON.stringify(result)
      }

      case 'get_maintenance': {
        const filter: { status?: string; categoryId?: string } = {}
        if (args.status) filter.status = String(args.status)
        if (args.category) filter.categoryId = String(args.category)
        const tasks = api.getMaintenanceTasks(filter)
        return JSON.stringify({ tasks, count: tasks.length })
      }

      case 'get_capital_forecast': {
        const filter: { priority?: string; year?: number } = {}
        if (args.priority) filter.priority = String(args.priority)
        if (args.year) filter.year = Number(args.year)
        const items = api.getCapitalForecast(filter)
        return JSON.stringify({ items, count: items.length })
      }

      case 'get_service_history': {
        const filter: { systemLabel?: string; afterDate?: string; beforeDate?: string } = {}
        if (args.system) filter.systemLabel = String(args.system)
        if (args.after_date) filter.afterDate = String(args.after_date)
        if (args.before_date) filter.beforeDate = String(args.before_date)
        const records = api.getServiceHistory(filter)
        return JSON.stringify({ records, count: records.length })
      }

      case 'get_ha_status': {
        const status = api.getHAStatus()
        return JSON.stringify({ sensors: status })
      }

      case 'read_file': {
        const fileId = String(args.file_id ?? '')
        const reason = String(args.reason ?? '')
        if (!fileId) return JSON.stringify({ error: 'file_id is required' })
        console.log(`[AI Tools] Reading file ${fileId} — reason: ${reason}`)
        const content = await api.readFile(fileId)
        return JSON.stringify({ fileId, content })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }
}
