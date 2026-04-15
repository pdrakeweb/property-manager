import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send, Sparkles, ChevronDown, Database, Loader2,
  Copy, ThumbsUp, Save, RefreshCw, AlertCircle, Settings, Wrench,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../utils/cn'
import { SUGGESTED_PROMPTS, PROPERTIES } from '../data/mockData'
import { useAppStore } from '../store/AppStoreContext'
import { getOpenRouterKey, getModelForTask, getDevModelOverride } from '../store/settings'
import { chatWithTools, OpenRouterError } from '../services/openRouterClient'
import { PropertyRecordsAPI } from '../services/PropertyRecordsAPI'
import { buildPropertyContext } from '../services/propertyContextBuilder'
import { AI_TOOLS, createToolExecutor } from '../services/aiTools'
import type { AIMessage } from '../types'
import type { ChatMessage } from '../services/openRouterClient'

const KNOWN_MODELS = [
  { id: 'anthropic/claude-opus-4-6',    label: 'Claude Opus 4.6',     badge: 'Best',    badgeColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' },
  { id: 'anthropic/claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',   badge: 'Fast',    badgeColor: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'     },
  { id: 'google/gemini-flash-1.5',       label: 'Gemini 1.5 Flash',    badge: 'Cheap',   badgeColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'},
  { id: 'openai/gpt-4o',                label: 'GPT-4o',               badge: '',        badgeColor: ''                              },
]

function getModels(currentId: string) {
  if (KNOWN_MODELS.some(m => m.id === currentId)) return KNOWN_MODELS
  const label = currentId.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? currentId
  return [
    { id: currentId, label, badge: 'Configured', badgeColor: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    ...KNOWN_MODELS,
  ]
}

const BASE_SYSTEM_PROMPT = `You are a knowledgeable property management advisor. You help homeowners understand, maintain, and make decisions about their property systems and equipment.

You have detailed knowledge of the homeowner's property loaded into your context below. Use it to give specific, actionable advice.

You also have access to tools that let you query the property records database for more detail. Use them when:
- The context summary doesn't have enough detail to answer confidently
- The user asks about specific records, dates, costs, or specs
- You need to look up related files for deeper information

Guidelines:
- Be concise and practical — homeowners want clear answers, not essays
- Reference specific equipment by name, brand, model, and age when relevant
- Suggest maintenance schedules, repair vs replace decisions, and cost estimates when appropriate
- If you don't have enough context, use your tools or ask clarifying questions
- Use markdown formatting (bold, lists, headers) for readability
- When discussing costs, give realistic ranges for the Midwest US market
- When you use a tool, briefly mention what you looked up so the user understands your process`

function ModelPicker({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const models = getModels(value)
  const current = models.find(m => m.id === value) ?? models[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl px-3 py-2 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{current.label}</span>
        {current.badge && (
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', current.badgeColor)}>
            {current.badge}
          </span>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 card-surface rounded-xl shadow-xl z-20 overflow-hidden">
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
                  m.id === value && 'bg-violet-50 dark:bg-violet-900/20',
                )}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-primary">{m.label}</div>
                </div>
                {m.badge && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', m.badgeColor)}>
                    {m.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: AIMessage }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function renderContent(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/)
      return (
        <span key={i}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
          {i < lines.length - 1 && <br />}
        </span>
      )
    })
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
        isUser ? 'bg-green-600 text-white' : 'bg-violet-600 text-white',
      )}>
        {isUser ? 'P' : <Sparkles className="w-4 h-4" />}
      </div>

      <div className={cn('max-w-[85%] group', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-green-600 text-white rounded-tr-sm'
            : 'card-surface rounded-tl-sm shadow-sm text-primary',
        )}>
          {renderContent(msg.content)}
        </div>

        {!isUser && (
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <Save className="w-3 h-3" />
              Save
            </button>
            <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <ThumbsUp className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className={cn(
          'text-xs text-slate-400 dark:text-slate-500 mt-1',
          isUser ? 'text-right' : 'text-left',
        )}>
          {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

export function AIAdvisoryScreen() {
  const navigate = useNavigate()
  const { activePropertyId } = useAppStore()
  const activeProperty = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]

  const devOverride = getDevModelOverride()
  const [model,    setModel]    = useState(() => devOverride || getModelForTask('advisory', 'anthropic/claude-opus-4-6'))
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const prevPropertyRef = useRef(activePropertyId)

  // Clear conversation when property changes
  useEffect(() => {
    if (prevPropertyRef.current !== activePropertyId) {
      prevPropertyRef.current = activePropertyId
      setMessages([])
      setStreamingContent('')
      setError(null)
      setToolStatus(null)
    }
  }, [activePropertyId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolStatus])

  const propertyContext = useMemo(
    () => buildPropertyContext(activePropertyId),
    [activePropertyId],
  )

  const recordsAPI = useMemo(
    () => new PropertyRecordsAPI(activePropertyId, null),
    [activePropertyId],
  )

  const toolExecutor = useMemo(
    () => createToolExecutor(recordsAPI),
    [recordsAPI],
  )

  const buildSystemPrompt = useCallback(() => {
    return `${BASE_SYSTEM_PROMPT}\n\n--- PROPERTY CONTEXT ---\n${propertyContext}\n--- END PROPERTY CONTEXT ---`
  }, [propertyContext])

  const buildChatHistory = useCallback((userText: string): ChatMessage[] => {
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
    ]
    const recentMessages = messages.slice(-20)
    for (const msg of recentMessages) {
      chatMessages.push({ role: msg.role, content: msg.content })
    }
    chatMessages.push({ role: 'user', content: userText })
    return chatMessages
  }, [messages, buildSystemPrompt])

  const apiKey = getOpenRouterKey()
  const isAIConfigured = !!apiKey

  async function handleSend(text = input.trim()) {
    if (!text || loading) return
    setInput('')
    setShowSuggestions(false)
    setError(null)
    setToolStatus(null)

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setStreamingContent('')

    if (!isAIConfigured) {
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: 'I need an OpenRouter API key to answer your questions. Go to **Settings** and enter your API key to enable AI features.\n\nYou can get a key at [openrouter.ai/keys](https://openrouter.ai/keys).',
        timestamp: new Date().toISOString(),
      }])
      setLoading(false)
      return
    }

    try {
      const chatMessages = buildChatHistory(text)

      await chatWithTools(
        {
          apiKey,
          model,
          messages: chatMessages,
          tools: AI_TOOLS,
        },
        toolExecutor,
        {
          onToken: (token) => {
            setToolStatus(null)
            setStreamingContent(prev => prev + token)
          },
          onDone: (fullText) => {
            const aiMsg: AIMessage = {
              id: `msg-${Date.now()}-ai`,
              role: 'assistant',
              content: fullText,
              timestamp: new Date().toISOString(),
            }
            setMessages(prev => [...prev, aiMsg])
            setStreamingContent('')
            setToolStatus(null)
            setLoading(false)
          },
          onError: (err) => {
            console.error('[AI Advisory] Error:', err)
            if (err.isUnauthorized) {
              setError('Invalid API key. Check your OpenRouter key in Settings.')
            } else if (err.isRateLimited) {
              setError('Rate limited by OpenRouter. Wait a moment and try again.')
            } else {
              setError(`AI request failed: ${err.message}`)
            }
            setStreamingContent('')
            setToolStatus(null)
            setLoading(false)
          },
        },
        (status) => setToolStatus(status),
      )
    } catch (err) {
      console.error('[AI Advisory] Request error:', err)
      const message = err instanceof OpenRouterError
        ? err.isUnauthorized
          ? 'Invalid API key. Check your OpenRouter key in Settings.'
          : `AI request failed (${err.status}): ${err.message}`
        : 'Failed to connect to OpenRouter. Check your internet connection.'
      setError(message)
      setStreamingContent('')
      setToolStatus(null)
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function clearConversation() {
    setMessages([])
    setStreamingContent('')
    setError(null)
    setToolStatus(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)] -mx-4 -my-5 sm:-mx-6 lg:-mx-8">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <ModelPicker value={model} onChange={setModel} />
          {isAIConfigured && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Database className="w-3 h-3" />
              <span className="hidden sm:inline font-medium">Connected</span>
            </div>
          )}
        </div>
        <button
          onClick={clearConversation}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>

      {/* ── API key warning ─────────────────────────────────────────────── */}
      {!isAIConfigured && (
        <div className="px-4 sm:px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
              Add your OpenRouter API key in Settings to enable AI responses.
            </span>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 shrink-0"
            >
              <Settings className="w-3 h-3" />
              Settings
            </button>
          </div>
        </div>
      )}

      {/* ── Context pill ────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Database className="w-3 h-3" />
          <span>
            Property context: <strong className="text-slate-700 dark:text-slate-300">{activeProperty.name}</strong>
            {' '}— {activeProperty.stats.documented}/{activeProperty.stats.total} systems documented, maintenance tasks, capital forecast, service history loaded
          </span>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-lg font-bold text-primary mb-1">Property Advisor</h2>
            <p className="text-sm text-muted max-w-xs mb-3">
              Ask anything about <strong>{activeProperty.shortName}</strong> — maintenance, repairs, budgets, upgrade decisions.
              Answers are grounded in your actual equipment data.
            </p>
            <p className="text-xs text-subtle max-w-xs">
              The AI has your full property index loaded and can query individual records for deeper detail.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Streaming response */}
        {loading && streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="max-w-[85%]">
              <div className="card-surface rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm text-sm leading-relaxed text-primary">
                {streamingContent.split('\n').map((line, i, arr) => {
                  const parts = line.split(/(\*\*[^*]+\*\*)/)
                  return (
                    <span key={i}>
                      {parts.map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={j}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                      {i < arr.length - 1 && <br />}
                    </span>
                  )
                })}
                <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              </div>
            </div>
          </div>
        )}

        {/* Tool use indicator */}
        {loading && toolStatus && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="card-surface rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Wrench className="w-4 h-4 text-violet-500 animate-pulse" />
                {toolStatus}
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (before anything starts) */}
        {loading && !streamingContent && !toolStatus && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="card-surface rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                Analyzing your property data…
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Suggested prompts ───────────────────────────────────────────── */}
      {showSuggestions && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <p className="text-xs font-medium text-muted mb-2">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-xs card-surface rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:border-green-300 dark:hover:border-green-700 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input area ──────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowSuggestions(s => !s)}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors mb-0.5',
              showSuggestions ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
            )}
          >
            <Sparkles className="w-4 h-4" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your property…"
              rows={1}
              className="w-full text-sm input-surface rounded-2xl px-4 py-2.5 pr-12 resize-none max-h-32 overflow-y-auto"
              style={{ minHeight: '42px' }}
            />
          </div>

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 hover:bg-green-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 transition-colors mb-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-subtle mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

    </div>
  )
}
