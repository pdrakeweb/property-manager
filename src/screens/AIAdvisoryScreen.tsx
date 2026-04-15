import { useState, useRef, useEffect } from 'react'
import {
  Send, Sparkles, ChevronDown, Database, Loader2,
  Copy, ThumbsUp, Save, RefreshCw,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { SAMPLE_AI_MESSAGES, SUGGESTED_PROMPTS } from '../data/mockData'
import type { AIMessage } from '../types'

const MODELS = [
  { id: 'anthropic/claude-opus-4-6',    label: 'Claude Opus 4.6',     badge: 'Best',    badgeColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' },
  { id: 'anthropic/claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',   badge: 'Fast',    badgeColor: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'     },
  { id: 'google/gemini-flash-1.5',       label: 'Gemini 1.5 Flash',    badge: 'Cheap',   badgeColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'},
  { id: 'openai/gpt-4o',                label: 'GPT-4o',               badge: '',        badgeColor: ''                              },
]

function ModelPicker({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = MODELS.find(m => m.id === value) ?? MODELS[0]

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
          <div className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
                  m.id === value && 'bg-violet-50 dark:bg-violet-900/20',
                )}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{m.label}</div>
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

  // Render basic markdown-ish formatting
  function renderContent(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      // Bold (**text**)
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
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
        isUser ? 'bg-green-600 text-white' : 'bg-violet-600 text-white',
      )}>
        {isUser ? 'P' : <Sparkles className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div className={cn('max-w-[85%] group', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-green-600 text-white rounded-tr-sm'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm shadow-sm',
        )}>
          {renderContent(msg.content)}
        </div>

        {/* Actions (AI messages only) */}
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
  const [model,    setModel]    = useState('anthropic/claude-opus-4-6')
  const [messages, setMessages] = useState<AIMessage[]>(SAMPLE_AI_MESSAGES)
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(text = input.trim()) {
    if (!text || loading) return
    setInput('')
    setShowSuggestions(false)

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Simulate AI response after delay
    setTimeout(() => {
      const response: AIMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: `Based on your property records at 2392 Tannerville Rd, here is my analysis:\n\n**Regarding "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"**\n\nI've reviewed your documented systems and maintenance history. This is a simulated response — connect your OpenRouter API key in Settings to get real AI answers grounded in your actual property data.\n\nYour knowledge base currently includes ${messages.filter(m => m.role === 'user').length + 1} documented systems with service history going back to 2023.`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, response])
      setLoading(false)
    }, 2000)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function clearConversation() {
    setMessages([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)] -mx-4 -my-5 sm:-mx-6 lg:-mx-8">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <ModelPicker value={model} onChange={setModel} />
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Database className="w-3 h-3" />
            <span className="hidden sm:inline font-medium">Context loaded</span>
          </div>
        </div>
        <button
          onClick={clearConversation}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>

      {/* ── Context pill ────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Database className="w-3 h-3" />
          <span>Property context: <strong className="text-slate-700 dark:text-slate-300">2392 Tannerville Rd</strong> — equipment records, maintenance history, capital forecast loaded</span>
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
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">Property Advisor</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              Ask anything about your property — maintenance, repairs, budgets, upgrade decisions.
              Answers are grounded in your actual equipment data.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                Analyzing your property data…
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Suggested prompts ───────────────────────────────────────────── */}
      {showSuggestions && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:border-green-300 dark:hover:border-green-700 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
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
              className="w-full text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl px-4 py-2.5 pr-12 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-300 resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500 max-h-32 overflow-y-auto"
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

    </div>
  )
}
