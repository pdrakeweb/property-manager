/**
 * Web Speech API wrapper.
 *
 * Phase 3 §7 calls for voice-memo entry on the maintenance flow. The
 * built-in `SpeechRecognition` / `webkitSpeechRecognition` API is good
 * enough on Chrome desktop and iOS 17+ Safari; this module hides the
 * vendor-prefix differences and the iOS quirk where recognition stops
 * automatically after short pauses (we restart it transparently when
 * `continuous` mode is requested).
 *
 * Static `isSupported` check lets callers gate UI — the planning doc's
 * "graceful fallback on unsupported browsers" criterion.
 */

// Minimal subset of the SpeechRecognition interface we use. The DOM lib
// types ship a fuller version but it's not in lib.dom.d.ts everywhere.
interface Recog {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: RecogEvent) => void) | null
  onend: (() => void) | null
  onerror: ((ev: { error: string }) => void) | null
}

interface RecogEvent {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type RecogCtor = new () => Recog

interface SRWindow {
  SpeechRecognition?: RecogCtor
  webkitSpeechRecognition?: RecogCtor
}

function getRecogCtor(): RecogCtor | null {
  const w = window as unknown as SRWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const isSpeechRecognitionSupported = (): boolean => getRecogCtor() !== null

export interface SpeechSessionOptions {
  /** Keep recognition running across natural pauses. Default: true. */
  continuous?: boolean
  /** BCP-47 lang tag. Default: navigator.language. */
  lang?: string
  onInterim?: (text: string) => void
  onFinal?:   (text: string) => void
  onError?:   (error: string) => void
  /** Fired when the session has fully stopped (after stop() or fatal error). */
  onEnd?:     () => void
}

/**
 * Start a recognition session. Returns a stop fn. Caller is responsible
 * for invoking it (e.g. on button release / pointerup / unmount).
 */
export function startSpeechSession(opts: SpeechSessionOptions = {}): () => void {
  const Ctor: RecogCtor | null = getRecogCtor()
  if (!Ctor) {
    opts.onError?.('Speech recognition not supported on this browser')
    opts.onEnd?.()
    return () => {}
  }

  const RecogCtorBound: RecogCtor = Ctor
  const continuous = opts.continuous ?? true
  const lang = opts.lang ?? navigator.language ?? 'en-US'
  let stopped = false
  let finalSoFar = ''

  function makeSession(): Recog {
    const r = new RecogCtorBound()
    r.continuous     = continuous
    r.interimResults = true
    r.lang           = lang

    r.onresult = (ev: RecogEvent) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          finalSoFar += (finalSoFar && !finalSoFar.endsWith(' ') ? ' ' : '') + text.trim()
          opts.onFinal?.(finalSoFar)
        } else {
          interim += text
        }
      }
      if (interim) opts.onInterim?.((finalSoFar + ' ' + interim).trim())
    }

    r.onend = () => {
      // iOS Safari ends recognition aggressively after pauses. Restart
      // automatically while still in continuous mode and not stopped by us.
      if (!stopped && continuous) {
        try { r.start() } catch { /* ignore re-start race */ }
        return
      }
      opts.onEnd?.()
    }

    r.onerror = (ev) => {
      // 'no-speech' fires constantly during long pauses; ignore unless fatal.
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      opts.onError?.(ev.error)
    }

    return r
  }

  const session = makeSession()
  try { session.start() } catch (err) {
    opts.onError?.(err instanceof Error ? err.message : String(err))
  }

  return function stop() {
    stopped = true
    try { session.stop() } catch { /* ignore */ }
  }
}
