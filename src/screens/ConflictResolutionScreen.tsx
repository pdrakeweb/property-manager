import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ArrowLeft, Trash2, GitMerge } from 'lucide-react'
import { localIndex } from '../lib/localIndex'
import type { IndexRecord } from '../lib/localIndex'
import { cn } from '../utils/cn'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a simple markdown file back into key→value pairs for display. */
function parseMd(md: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of md.split('\n')) {
    const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/) ?? line.match(/^-\s+\*\*(.+?):\*\*\s*(.+)$/)
    if (m) result[m[1].trim()] = m[2].trim()
  }
  return result
}

/** Keys that differ between two field objects. */
function diffKeys(a: Record<string, string>, b: Record<string, string>): Set<string> {
  const all  = new Set([...Object.keys(a), ...Object.keys(b)])
  const diff = new Set<string>()
  for (const k of all) {
    if (a[k] !== b[k]) diff.add(k)
  }
  return diff
}

// ── Conflict pair ─────────────────────────────────────────────────────────────

interface ConflictPair {
  original: IndexRecord   // syncState === 'conflict' — what was already in Drive
  v2:       IndexRecord   // the local version written as _v2_ file
}

function buildConflictPairs(): ConflictPair[] {
  const conflicts = localIndex.getConflicts()
  const pairs: ConflictPair[] = []

  for (const original of conflicts) {
    if (!original.conflictWithId) continue
    const v2 = localIndex.getById(original.conflictWithId)
    if (v2) pairs.push({ original, v2 })
  }
  return pairs
}

// ── Field comparison table ───────────────────────────────────────────────────

function FieldTable({
  original,
  v2,
  diffed,
  edits,
  onEdit,
}: {
  original: Record<string, string>
  v2:       Record<string, string>
  diffed:   Set<string>
  edits:    Record<string, string>
  onEdit:   (key: string, val: string) => void
}) {
  const allKeys = [...new Set([...Object.keys(original), ...Object.keys(v2)])]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <th className="text-left py-2 px-3 w-1/4 font-semibold">Field</th>
            <th className="text-left py-2 px-3 w-[37.5%] font-semibold">Drive version</th>
            <th className="text-left py-2 px-3 w-[37.5%] font-semibold">Your version (v2)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {allKeys.map(key => {
            const isDiff = diffed.has(key)
            return (
              <tr key={key} className={isDiff ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                <td className={cn('py-2 px-3 font-medium', isDiff ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}>
                  {key}
                  {isDiff && <span className="ml-1 text-amber-400">●</span>}
                </td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{original[key] ?? <span className="text-slate-300 dark:text-slate-600 italic">—</span>}</td>
                <td className="py-2 px-3">
                  {isDiff ? (
                    <input
                      type="text"
                      value={edits[key] ?? v2[key] ?? ''}
                      onChange={e => onEdit(key, e.target.value)}
                      className="w-full text-xs border border-amber-300 dark:border-amber-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  ) : (
                    <span className="text-slate-700">{v2[key] ?? <span className="text-slate-300 italic">—</span>}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Single conflict card ──────────────────────────────────────────────────────

function ConflictCard({
  pair,
  onResolved,
}: {
  pair:       ConflictPair
  onResolved: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [edits,    setEdits]    = useState<Record<string, string>>({})
  const [saving,   setSaving]   = useState(false)

  const origFields = parseMd((pair.original.data.mdContent as string | undefined) ?? '')
  const v2Fields   = parseMd((pair.v2.data.mdContent      as string | undefined) ?? '')
  const diffed     = diffKeys(origFields, v2Fields)

  function handleEdit(key: string, val: string) {
    setEdits(prev => ({ ...prev, [key]: val }))
  }

  async function keepMine() {
    setSaving(true)
    // Keep v2 as canonical: mark original soft-deleted, mark v2 as the winner
    localIndex.softDelete(pair.original.id)
    localIndex.upsert({
      ...pair.v2,
      syncState:      'pending_upload',  // re-queue to overwrite original in Drive
      conflictWithId: undefined,
      title:          pair.v2.title.replace(' (v2)', ''),
    })
    onResolved()
  }

  async function keepTheirs() {
    setSaving(true)
    // Discard v2, restore original as synced
    localIndex.softDelete(pair.v2.id)
    localIndex.upsert({
      ...pair.original,
      syncState:      'synced',
      conflictWithId: undefined,
    })
    onResolved()
  }

  async function saveMerge() {
    setSaving(true)
    // Build merged data by overlaying edits onto v2 fields
    const mergedFields = { ...v2Fields, ...edits }

    // Reconstruct minimal markdown from the merged fields
    const mergedMd = Object.entries(mergedFields)
      .map(([k, v]) => `**${k}:** ${v}`)
      .join('\n')

    // Write merged as a pending_upload replacing the original record
    localIndex.softDelete(pair.v2.id)
    localIndex.upsert({
      ...pair.original,
      syncState:      'pending_upload',
      conflictWithId: undefined,
      data:           { ...pair.original.data, mdContent: mergedMd },
    })
    onResolved()
  }

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-2xl bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{pair.original.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {pair.original.type} · {pair.original.propertyId} · {diffed.size} field{diffed.size !== 1 ? 's' : ''} differ
          </p>
        </div>
        <span className="text-xs text-amber-600 font-medium shrink-0">
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-amber-100 dark:border-amber-900">
          <FieldTable
            original={origFields}
            v2={v2Fields}
            diffed={diffed}
            edits={edits}
            onEdit={handleEdit}
          />

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 px-5 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={keepMine}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Keep mine (v2)
            </button>
            <button
              type="button"
              onClick={keepTheirs}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Keep theirs (Drive)
            </button>
            {diffed.size > 0 && (
              <button
                type="button"
                onClick={saveMerge}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 text-xs font-semibold transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Save merge
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function ConflictResolutionScreen() {
  const navigate = useNavigate()
  const [pairs, setPairs] = useState<ConflictPair[]>(() => buildConflictPairs())

  const handleResolved = useCallback(() => {
    // Refresh the list after any resolution action
    setPairs(buildConflictPairs())
  }, [])

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sync Conflicts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            These records were modified both locally and in Drive. Choose which version to keep.
          </p>
        </div>
      </div>

      {/* Conflict list */}
      {pairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No conflicts</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">All records are in sync.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {pairs.length} conflict{pairs.length !== 1 ? 's' : ''} need your attention.
            Amber fields differ between versions — edit them before saving a merge.
          </p>
          {pairs.map(pair => (
            <ConflictCard
              key={pair.original.id}
              pair={pair}
              onResolved={handleResolved}
            />
          ))}
        </div>
      )}
    </div>
  )
}
