/**
 * AI Interaction Logger — records all AI operations for debugging.
 *
 * Each chat session gets its own log. Logs include:
 * - System prompt sent
 * - User messages
 * - Tool calls (name, args, results)
 * - Streaming tokens
 * - API errors
 * - Timing data
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'api' | 'stream' | 'error'
  message: string
  data?: unknown
  durationMs?: number
}

export class AISessionLogger {
  private entries: LogEntry[] = []
  private sessionId: string
  private startTime: number

  constructor() {
    this.sessionId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.startTime = Date.now()
    this.log('info', 'system', 'AI session started')
  }

  log(level: LogLevel, category: LogEntry['category'], message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data !== undefined ? this.safeSerialize(data) : undefined,
    }
    this.entries.push(entry)

    // Also log to browser console for real-time debugging
    const prefix = `[AI:${category}]`
    if (level === 'error') {
      console.error(prefix, message, data ?? '')
    } else if (level === 'warn') {
      console.warn(prefix, message, data ?? '')
    } else {
      console.log(prefix, message, data ?? '')
    }
  }

  logSystemPrompt(prompt: string): void {
    this.log('debug', 'system', `System prompt (${prompt.length} chars)`, {
      length: prompt.length,
      preview: prompt.slice(0, 300) + (prompt.length > 300 ? '...' : ''),
    })
  }

  logUserMessage(text: string): void {
    this.log('info', 'user', text)
  }

  logApiRequest(model: string, messageCount: number, hasTools: boolean): void {
    this.log('info', 'api', `API request → ${model} (${messageCount} messages, tools: ${hasTools})`, {
      model,
      messageCount,
      hasTools,
    })
  }

  logApiResponse(status: number, durationMs: number, finishReason?: string): void {
    this.log('info', 'api', `API response ← ${status} (${durationMs}ms, finish: ${finishReason ?? 'unknown'})`, {
      status,
      durationMs,
      finishReason,
    })
  }

  logToolCall(name: string, args: Record<string, unknown>): void {
    this.log('info', 'tool_call', `Tool call: ${name}`, { name, args })
  }

  logToolResult(name: string, result: string, durationMs: number): void {
    const preview = result.length > 500 ? result.slice(0, 500) + '...' : result
    this.log('info', 'tool_result', `Tool result: ${name} (${durationMs}ms, ${result.length} chars)`, {
      name,
      durationMs,
      resultLength: result.length,
      preview,
    })
  }

  logToolError(name: string, error: string): void {
    this.log('error', 'tool_result', `Tool error: ${name} — ${error}`, { name, error })
  }

  logStreamStart(): void {
    this.log('debug', 'stream', 'Streaming started')
  }

  logStreamEnd(totalChars: number, durationMs: number): void {
    this.log('info', 'stream', `Stream complete: ${totalChars} chars in ${durationMs}ms`, {
      totalChars,
      durationMs,
    })
  }

  logAssistantMessage(content: string): void {
    this.log('info', 'assistant', `Response (${content.length} chars)`, {
      length: content.length,
      preview: content.slice(0, 200) + (content.length > 200 ? '...' : ''),
    })
  }

  logError(message: string, error?: unknown): void {
    this.log('error', 'error', message, {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    })
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  getSessionId(): string {
    return this.sessionId
  }

  getSessionDurationMs(): number {
    return Date.now() - this.startTime
  }

  clear(): void {
    this.entries = []
    this.startTime = Date.now()
    this.sessionId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.log('info', 'system', 'AI session reset')
  }

  /** Format log for display */
  formatForDisplay(): string {
    return this.entries.map(e => {
      const time = e.timestamp.slice(11, 23) // HH:mm:ss.SSS
      const icon = {
        system: '⚙️',
        user: '👤',
        assistant: '🤖',
        tool_call: '🔧',
        tool_result: '📦',
        api: '🌐',
        stream: '📡',
        error: '❌',
      }[e.category]
      const levelTag = e.level === 'error' ? ' [ERROR]' : e.level === 'warn' ? ' [WARN]' : ''
      let line = `${time} ${icon} ${e.message}${levelTag}`
      if (e.data && e.level !== 'debug') {
        line += `\n         ${JSON.stringify(e.data, null, 2).split('\n').join('\n         ')}`
      }
      return line
    }).join('\n')
  }

  private safeSerialize(data: unknown): unknown {
    try {
      // Test that it's serializable
      JSON.stringify(data)
      return data
    } catch {
      return String(data)
    }
  }
}
