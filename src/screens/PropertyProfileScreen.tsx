import { useState, useEffect, useRef } from 'react'
import { FileText, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'

import {
  NARRATIVE_QUESTIONS,
  getNarrativeEntry,
  saveNarrativeEntry,
  getNarrativeText,
} from '../lib/narrativeStore'

function QuestionCard({
  questionId,
  question,
  placeholder,
  propertyId,
}: {
  questionId: string
  question: string
  placeholder: string
  propertyId: string
}) {
  const existing = getNarrativeEntry(propertyId, questionId)
  const [value, setValue] = useState(existing?.answer ?? '')
  const [saved, setSaved] = useState(false)
  const prevPropertyRef = useRef(propertyId)

  // Reset when property changes
  useEffect(() => {
    if (prevPropertyRef.current !== propertyId) {
      prevPropertyRef.current = propertyId
      const entry = getNarrativeEntry(propertyId, questionId)
      setValue(entry?.answer ?? '')
      setSaved(false)
    }
  }, [propertyId, questionId])

  function handleBlur() {
    const trimmed = value.trim()
    const prev = getNarrativeEntry(propertyId, questionId)?.answer ?? ''
    if (trimmed !== prev) {
      saveNarrativeEntry(propertyId, questionId, question, trimmed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const hasAnswer = value.trim().length > 0

  return (
    <div className="card-surface rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <label className="text-sm font-semibold text-primary">{question}</label>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            Saved
          </span>
        )}
        {!saved && hasAnswer && (
          <span className="w-2 h-2 bg-emerald-400 rounded-full shrink-0 mt-1.5" />
        )}
      </div>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={3}
        className="w-full text-sm input-surface rounded-xl px-3 py-2.5 resize-none"
      />
    </div>
  )
}

export function PropertyProfileScreen() {
  const { activePropertyId, properties } = useAppStore()
  const property = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const [showPreview, setShowPreview] = useState(false)
  const [previewTick, setPreviewTick] = useState(0)

  // Refresh preview when toggled
  const narrativeText = showPreview ? getNarrativeText(activePropertyId) : ''

  const answeredCount = NARRATIVE_QUESTIONS.filter(q =>
    (getNarrativeEntry(activePropertyId, q.id)?.answer ?? '').trim().length > 0
  ).length

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-primary">Property Profile</h1>
        <p className="text-sm text-muted mt-0.5">
          Tell us about <strong>{property.shortName}</strong> — this context helps the AI advisor give more relevant answers.
        </p>
      </div>

      {/* Progress */}
      <div className="card-surface rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Profile Completeness</span>
          <span className="text-xs font-semibold text-primary">{answeredCount}/{NARRATIVE_QUESTIONS.length}</span>
        </div>
        <div className="h-2 muted-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(answeredCount / NARRATIVE_QUESTIONS.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-subtle mt-2">
          Answers auto-save when you click away. The AI advisor uses this narrative as context for every conversation.
        </p>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {NARRATIVE_QUESTIONS.map(q => (
          <QuestionCard
            key={`${activePropertyId}-${q.id}`}
            questionId={q.id}
            question={q.question}
            placeholder={q.placeholder}
            propertyId={activePropertyId}
          />
        ))}
      </div>

      {/* Narrative Preview */}
      <div>
        <button
          onClick={() => { setShowPreview(s => !s); setPreviewTick(t => t + 1) }}
          className={cn(
            'flex items-center gap-2 text-sm font-semibold transition-colors',
            showPreview ? 'text-violet-600 dark:text-violet-400' : 'text-muted hover:text-primary',
          )}
        >
          {showPreview ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          {showPreview ? 'Hide AI Context Preview' : 'Show AI Context Preview'}
        </button>

        {showPreview && (
          <div className="mt-3 card-surface rounded-2xl p-4 shadow-sm" data-tick={previewTick}>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              This text is sent to the AI as part of the property context:
            </p>
            {narrativeText ? (
              <pre className="text-xs text-primary font-mono whitespace-pre-wrap leading-relaxed">
                {narrativeText}
              </pre>
            ) : (
              <p className="text-sm text-subtle italic">No answers yet — fill in the questions above to build your property narrative.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
