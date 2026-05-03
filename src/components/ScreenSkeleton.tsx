/**
 * Suspense fallback for the lazy-loaded route screens.
 *
 * Approximates the typical screen layout — header row + a few content blocks
 * — so the transition from spinner-flash to real content feels less jarring.
 * Per-screen skeletons would be more accurate but would require maintaining
 * 23 of them; this generic shape is a deliberate compromise. The pulse comes
 * from Tailwind's `animate-pulse` and respects the user's
 * prefers-reduced-motion setting.
 */
export function ScreenSkeleton() {
  return (
    <div
      className="space-y-5 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Loading screen"
    >
      {/* Header row: title + action button */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3.5 w-60 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded-xl shrink-0" />
      </div>

      {/* Tab strip placeholder */}
      <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />

      {/* Content blocks */}
      <div className="space-y-3">
        <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
