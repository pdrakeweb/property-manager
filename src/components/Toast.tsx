/**
 * Global toast / snackbar system.
 *
 * Replaces the per-screen ad-hoc status text (AIAdvisoryScreen "Copied!",
 * SyncScreen result string, etc.) with a single canonical surface that's
 * also a screen-reader live region (aria-live="polite" for info/success,
 * "assertive" for error/warn).
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success('Synced')
 *   toast.error('Drive 401', { duration: 8000 })
 *
 * Mount the <ToastProvider> once at the top of the React tree (App.tsx).
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '../utils/cn'

type ToastKind = 'info' | 'success' | 'error' | 'warn'

interface ToastOptions {
  /** ms before auto-dismiss. 0 = sticky. Default: 4000 (info/success) or 8000 (warn/error). */
  duration?: number
}

interface Toast {
  id: number
  kind: ToastKind
  message: string
  duration: number
}

interface ToastApi {
  info:    (message: string, opts?: ToastOptions) => void
  success: (message: string, opts?: ToastOptions) => void
  error:   (message: string, opts?: ToastOptions) => void
  warn:    (message: string, opts?: ToastOptions) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>')
  return ctx
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info:    4000,
  success: 4000,
  warn:    8000,
  error:   8000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((kind: ToastKind, message: string, opts?: ToastOptions) => {
    const id = ++nextId.current
    const duration = opts?.duration ?? DEFAULT_DURATION[kind]
    setToasts(t => [...t, { id, kind, message, duration }])
  }, [])

  const api: ToastApi = {
    info:    useCallback((m, o) => push('info',    m, o), [push]),
    success: useCallback((m, o) => push('success', m, o), [push]),
    error:   useCallback((m, o) => push('error',   m, o), [push]),
    warn:    useCallback((m, o) => push('warn',    m, o), [push]),
    dismiss,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ── Viewport ─────────────────────────────────────────────────────────────────

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  // Two regions: polite for info/success, assertive for warn/error.
  const polite    = toasts.filter(t => t.kind === 'info'    || t.kind === 'success')
  const assertive = toasts.filter(t => t.kind === 'warn'    || t.kind === 'error')

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed inset-x-0 bottom-20 sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto z-[100] pointer-events-none flex flex-col items-center sm:items-end gap-2 px-4"
    >
      <div role="status" aria-live="polite"      className="flex flex-col gap-2 w-full sm:w-auto pointer-events-none">
        {polite.map(t => <ToastItem key={t.id} toast={t} dismiss={dismiss} />)}
      </div>
      <div role="alert"  aria-live="assertive"   className="flex flex-col gap-2 w-full sm:w-auto pointer-events-none">
        {assertive.map(t => <ToastItem key={t.id} toast={t} dismiss={dismiss} />)}
      </div>
    </div>
  )
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const { id, kind, message, duration } = toast

  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(() => dismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, dismiss])

  const styles = {
    info:    'bg-slate-800 dark:bg-slate-700 text-slate-100 border-slate-700',
    success: 'bg-emerald-600 text-white border-emerald-500',
    warn:    'bg-amber-600 text-white border-amber-500',
    error:   'bg-red-600 text-white border-red-500',
  }[kind]

  const Icon = {
    info:    Info,
    success: CheckCircle2,
    warn:    AlertTriangle,
    error:   AlertCircle,
  }[kind]

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-2 sm:max-w-sm w-full rounded-xl shadow-lg border px-3 py-2.5 text-sm',
        styles,
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1 leading-snug break-words">{message}</span>
      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label="Dismiss"
        className="shrink-0 text-white/80 hover:text-white -m-1 p-1 rounded transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
