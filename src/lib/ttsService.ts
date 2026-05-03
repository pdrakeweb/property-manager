/**
 * Wraps `window.speechSynthesis` for guided-checklist read-aloud.
 *
 * Phase 3 §3 calls for TTS on each step's instructions. The Web Speech
 * API SpeechSynthesis is broadly supported but quirky — iOS Safari
 * needs a user gesture before the first speak() call, and queue
 * behavior across browsers is inconsistent. This wrapper:
 *
 *   - exposes `isSpeechSynthesisSupported()` for conditional rendering
 *   - cancels any in-flight utterance before starting a new one (no
 *     queueing — the spec wants per-step "speak this now")
 *   - falls back silently when unavailable
 */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window
}

interface SpeakOptions {
  /** BCP-47 lang tag. Default: navigator.language. */
  lang?:  string
  /** 0.1–10. Default 1. */
  rate?:  number
  /** 0–1. Default 1. */
  volume?: number
  onStart?: () => void
  onEnd?:   () => void
  onError?: (msg: string) => void
}

export function speak(text: string, opts: SpeakOptions = {}): () => void {
  if (!isSpeechSynthesisSupported() || !text) {
    opts.onEnd?.()
    return () => {}
  }
  // Cancel any previous utterance.
  window.speechSynthesis.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.lang   = opts.lang ?? navigator.language ?? 'en-US'
  u.rate   = opts.rate ?? 1
  u.volume = opts.volume ?? 1

  u.onstart = () => opts.onStart?.()
  u.onend   = () => opts.onEnd?.()
  u.onerror = (e) => opts.onError?.(e.error ?? 'speech synthesis error')

  window.speechSynthesis.speak(u)
  return function stop() {
    window.speechSynthesis.cancel()
  }
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel()
}
