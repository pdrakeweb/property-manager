/**
 * Cross-record search results.
 *
 * Reads the query from `?q=` and renders matches grouped by record type.
 * The actual ranking lives in `lib/recordSearch.ts`. Users land here via
 * the AppShell search box (sidebar) or by visiting `#/search?q=foo`.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search as SearchIcon, X } from 'lucide-react'
import { useAppStore } from '../store/AppStoreContext'
import { searchAllRecords, type SearchResult } from '../lib/recordSearch'

function getQueryParam(hash: string): string {
  // HashRouter passes the query string after the route. e.g. "#/search?q=foo"
  const i = hash.indexOf('?')
  if (i < 0) return ''
  const params = new URLSearchParams(hash.slice(i + 1))
  return params.get('q') ?? ''
}

export function SearchScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activePropertyId } = useAppStore()

  const initialQuery = getQueryParam(window.location.hash)
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Keep ?q= in sync with the input (so reload preserves the query).
  useEffect(() => {
    const next = query.trim()
    const current = getQueryParam(window.location.hash)
    if (next === current) return
    const path = location.pathname
    const newHash = next ? `${path}?q=${encodeURIComponent(next)}` : path
    if (`#${newHash}` !== window.location.hash) {
      window.history.replaceState(null, '', `#${newHash}`)
    }
  }, [query, location.pathname])

  const results = useMemo<SearchResult[]>(
    () => searchAllRecords(query, activePropertyId, 80),
    [query, activePropertyId],
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, { typeLabel: string; items: SearchResult[] }>()
    for (const r of results) {
      const g = groups.get(r.type)
      if (g) g.items.push(r)
      else groups.set(r.type, { typeLabel: r.typeLabel, items: [r] })
    }
    return [...groups.entries()].map(([type, g]) => ({ type, ...g }))
  }, [results])

  const trimmed = query.trim()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Search</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Across every record on this property.</p>
      </div>

      {/* Input */}
      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Vendor, equipment, permit number, contractor…"
          className="w-full pl-10 pr-10 py-2.5 text-sm input-surface rounded-xl"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results */}
      {trimmed === '' ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Type a query to search.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <p className="text-sm">No matches for "{trimmed}".</p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-slate-400 dark:text-slate-500">{results.length} result{results.length === 1 ? '' : 's'}</p>
          {grouped.map(g => (
            <section key={g.type}>
              <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                {g.typeLabel} <span className="text-slate-400 dark:text-slate-500 font-normal">({g.items.length})</span>
              </h2>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden">
                {g.items.map(r => (
                  <button
                    key={r.record.id}
                    type="button"
                    onClick={() => navigate(r.href.replace(/^#/, ''))}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{r.title}</p>
                    {r.snippet && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{r.snippet}</p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
