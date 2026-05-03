/**
 * Hold-or-tap mic button that opens the voice memo flow.
 *
 * Phase 3 §7 specced press-and-hold; that pattern is unreliable across
 * iOS Safari / desktop / accessibility tooling, so this component uses
 * a simple tap-to-toggle: tap to start, tap again to stop, then a
 * VoiceMemoReview modal pops up with the transcript + AI-parsed fields.
 *
 * The button hides itself entirely when SpeechRecognition isn't
 * available — the parent form's plain text fields remain reachable.
 */

import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { cn } from '../../utils/cn'
import { isSpeechRecognitionSupported, startSpeechSession } from '../../lib/speechRecognition'
import { useToast } from '../Toast'
import { VoiceMemoReview } from './VoiceMemoReview'
import type { ParsedVoiceMemo } from '../../lib/voiceMemoParser'

interface VoiceMemoButtonProps {
  /** Optional category / system hint passed to the AI parser. */
  contextHint?: string
  /** Called when the user accepts the parsed memo. */
  onApply: (parsed: ParsedVoiceMemo) => void
  className?: string
  size?: 'sm' | 'md'
}

export function VoiceMemoButton({ contextHint, onApply, className, size = 'md' }: VoiceMemoButtonProps) {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const toast = useToast()
  const supported = isSpeechRecognitionSupported()

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopRef.current?.()
  }, [])

  if (!supported) return null

  function startRecording() {
    setTranscript('')
    setRecording(true)
    stopRef.current = startSpeechSession({
      onInterim: (t) => setTranscript(t),
      onFinal:   (t) => setTranscript(t),
      onError:   (err) => {
        toast.error(`Voice capture error: ${err}`)
        setRecording(false)
      },
      onEnd: () => {
        setRecording(false)
        stopRef.current = null
      },
    })
  }

  function stopRecording() {
    stopRef.current?.()
    stopRef.current = null
    setRecording(false)
    if (transcript.trim().length > 0) setReviewOpen(true)
  }

  function handleClick() {
    if (recording) stopRecording()
    else startRecording()
  }

  const sizeCls = size === 'sm'
    ? 'w-8 h-8 rounded-lg'
    : 'w-10 h-10 rounded-xl'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={recording ? 'Stop voice memo' : 'Start voice memo'}
        aria-pressed={recording}
        title={recording ? 'Tap to stop' : 'Tap to record voice memo'}
        className={cn(
          sizeCls,
          'flex items-center justify-center transition-colors shrink-0',
          recording
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
          className,
        )}
      >
        {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>

      {/* Live transcript line — visible only while recording, anchored
          beneath the button by the parent's flex layout. */}
      {recording && transcript && (
        <span className="text-xs text-slate-500 dark:text-slate-400 italic flex-1 truncate" aria-live="polite">
          {transcript}
        </span>
      )}

      {reviewOpen && (
        <VoiceMemoReview
          transcript={transcript}
          contextHint={contextHint}
          onClose={() => { setReviewOpen(false); setTranscript('') }}
          onApply={(parsed) => { onApply(parsed); setReviewOpen(false); setTranscript('') }}
        />
      )}
    </>
  )
}
