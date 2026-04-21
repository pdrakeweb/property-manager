/**
 * OpenRouter chat completions client — browser-side, no backend required.
 * Supports standard chat, streaming, and function calling (tool use).
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

// ─── Message types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** For assistant messages with tool calls */
  tool_calls?: ToolCall[]
  /** For tool result messages */
  tool_call_id?: string
}

// ─── Tool types ────────────────────────────────────────────────────────────────

export interface ChatTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// ─── Options ───────────────────────────────────────────────────────────────────

export interface ChatCompletionOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  tools?: ChatTool[]
  /** If set, requests OpenAI-style structured output (OpenRouter supports `{type:'json_object'}`). */
  responseFormat?: { type: 'json_object' } | { type: 'text' }
  logger?: import('./aiLogger').AISessionLogger
}

export interface ChatCompletionResult {
  content: string
  model: string
  toolCalls?: ToolCall[]
  finishReason?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ─── Streaming callbacks ───────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: OpenRouterError) => void
  /** Called when the model wants to use tools instead of responding with text */
  onToolCalls?: (toolCalls: ToolCall[]) => void
}

// ─── Tool executor type ────────────────────────────────────────────────────────

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>

// ─── Error class ───────────────────────────────────────────────────────────────

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }
}

// ─── Request builder ───────────────────────────────────────────────────────────

function buildRequestBody(opts: ChatCompletionOptions, stream: boolean) {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    stream,
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
  }
  if (opts.responseFormat) {
    body.response_format = opts.responseFormat
  }
  return body
}

function buildHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Property Manager',
  }
}

// ─── Non-streaming completions ─────────────────────────────────────────────────

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const log = opts.logger
  const start = Date.now()
  log?.logApiRequest(opts.model, opts.messages.length, !!(opts.tools?.length))

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(opts.apiKey),
    body: JSON.stringify(buildRequestBody(opts, false)),
  })

  if (!response.ok) {
    const errText = await response.text()
    log?.logError(`API ${response.status}: ${errText.slice(0, 300)}`)
    throw new OpenRouterError(
      `OpenRouter request failed (${response.status}): ${errText}`,
      response.status,
    )
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  log?.logApiResponse(response.status, Date.now() - start, choice?.finish_reason)

  if (choice?.message?.tool_calls?.length) {
    for (const tc of choice.message.tool_calls) {
      log?.logToolCall(tc.function.name, JSON.parse(tc.function.arguments || '{}'))
    }
  }

  return {
    content: choice?.message?.content ?? '',
    model: data.model ?? opts.model,
    toolCalls: choice?.message?.tool_calls,
    finishReason: choice?.finish_reason,
    usage: data.usage,
  }
}

// ─── Streaming completions ─────────────────────────────────────────────────────

export async function chatCompletionStream(
  opts: ChatCompletionOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(opts.apiKey),
    body: JSON.stringify(buildRequestBody(opts, true)),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new OpenRouterError(
      `OpenRouter stream failed (${response.status}): ${errText}`,
      response.status,
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new OpenRouterError('No response body for streaming', 0)
  }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          // Check if we collected tool calls
          if (toolCalls.size > 0 && callbacks.onToolCalls) {
            const calls: ToolCall[] = Array.from(toolCalls.values()).map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            }))
            callbacks.onToolCalls(calls)
            return
          }
          callbacks.onDone(fullText)
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta

          // Accumulate text content
          if (delta?.content) {
            fullText += delta.content
            callbacks.onToken(delta.content)
          }

          // Accumulate tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' })
              }
              const existing = toolCalls.get(idx)!
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name = tc.function.name
              if (tc.function?.arguments) existing.arguments += tc.function.arguments
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    // Stream ended without [DONE]
    if (toolCalls.size > 0 && callbacks.onToolCalls) {
      const calls: ToolCall[] = Array.from(toolCalls.values()).map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }))
      callbacks.onToolCalls(calls)
    } else {
      callbacks.onDone(fullText)
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      callbacks.onError(err)
    } else {
      callbacks.onError(new OpenRouterError(String(err), 0))
    }
  }
}

// ─── Chat with tools (handles the full tool-use loop) ──────────────────────────

/**
 * High-level function that handles the complete tool-use conversation loop:
 * 1. Send messages + tool definitions
 * 2. If model returns tool_calls → execute them → append results
 * 3. Re-send → repeat until model returns a text response
 * 4. Stream the final text answer
 *
 * @param opts - Chat completion options including tools
 * @param executeToolCall - Function that executes a tool call and returns the result string
 * @param callbacks - Streaming callbacks for the final text response
 * @param onToolStatus - Optional callback for UI updates during tool execution
 * @param maxRounds - Max tool-use rounds before forcing a text response (default 5)
 */
export async function chatWithTools(
  opts: ChatCompletionOptions,
  executeToolCall: ToolExecutor,
  callbacks: StreamCallbacks,
  onToolStatus?: (status: string) => void,
  maxRounds = 5,
): Promise<void> {
  const messages = [...opts.messages]
  let rounds = 0

  while (rounds < maxRounds) {
    rounds++

    // Use non-streaming for tool-use rounds (simpler parsing)
    // Only stream the final text response
    const result = await chatCompletion({ ...opts, messages })

    if (result.toolCalls && result.toolCalls.length > 0 && result.finishReason === 'tool_calls') {
      // Add the assistant's tool-call message
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      })

      // Execute each tool call and add results
      for (const tc of result.toolCalls) {
        const toolName = tc.function.name
        onToolStatus?.(`Using tool: ${toolName}...`)
        const toolStart = Date.now()
        try {
          const args = JSON.parse(tc.function.arguments)
          opts.logger?.logToolCall(toolName, args)
          const toolResult = await executeToolCall(toolName, args)
          opts.logger?.logToolResult(toolName, toolResult, Date.now() - toolStart)
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          opts.logger?.logToolError(toolName, errMsg)
          messages.push({
            role: 'tool',
            content: `[Tool error: ${errMsg}]`,
            tool_call_id: tc.id,
          })
        }
      }

      // Continue the loop — re-send with tool results
      continue
    }

    // No tool calls — this is the final text response
    if (result.content) {
      // Deliver the content we already have (simulate streaming for nice UX)
      for (const char of result.content) {
        callbacks.onToken(char)
      }
      callbacks.onDone(result.content)
      return
    }

    // Empty response from non-streaming — try once more with streaming directly (no tools)
    // This handles models that return empty on tool-capable requests
    opts.logger?.log('warn', 'api', 'Empty response from tool-capable request, retrying without tools')
    try {
      await chatCompletionStream({ ...opts, messages, tools: undefined }, callbacks)
    } catch {
      callbacks.onDone('')
    }
    return
  }

  // Exceeded max rounds — force a final response without tools
  onToolStatus?.('Finalizing response...')
  const finalOpts = { ...opts, messages, tools: undefined }
  await chatCompletionStream(finalOpts, callbacks)
}
