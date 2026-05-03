import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Printer, Download, UploadCloud, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'

import { useAppStore } from '../store/AppStoreContext'
import { getUserName } from '../auth/oauth'
import { getValidToken } from '../auth/oauth'
import { DriveClient } from '../lib/driveClient'
import {
  collectHomeBook, sectionHasData, HOME_BOOK_SECTIONS,
  type HomeBookData, type HomeBookSectionId,
} from '../lib/homeBook'
import {
  renderHomeBookBody, renderHomeBookHtml, homeBookFilename, HOME_BOOK_STYLES,
} from '../lib/homeBookPdf'
import { syncBus } from '../lib/syncBus'

type ShareState =
  | { kind: 'idle' }
  | { kind: 'sharing' }
  | { kind: 'shared',  filename: string, webViewLink?: string }
  | { kind: 'error',   message: string }

export function HomeBookScreen() {
  const { activePropertyId, properties } = useAppStore()
  const property = properties.find(p => p.id === activePropertyId) ?? properties[0]

  const [preparedBy, setPreparedBy] = useState(() => getUserName() || 'Owner')
  const [enabled, setEnabled] = useState<Set<HomeBookSectionId>>(
    () => new Set(HOME_BOOK_SECTIONS.map(s => s.id)),
  )
  const [tick, setTick] = useState(0)
  const [share, setShare] = useState<ShareState>({ kind: 'idle' })

  // Re-collect when the active property changes, the bus emits an update,
  // or the prepared-by string changes. The collector is fast (in-memory).
  const data: HomeBookData | null = useMemo(() => {
    if (!property) return null
    try {
      return collectHomeBook(property.id, preparedBy)
    } catch {
      return null
    }
    // tick is intentional — we want a re-collect when the bus signals new data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, preparedBy, tick])

  // Refresh on remote sync events so a Drive pull mid-preview shows fresh data.
  useEffect(() => {
    const unsub = syncBus.subscribe(ev => {
      if (ev.type === 'index-updated') setTick(t => t + 1)
    })
    return unsub
  }, [])

  // Inject the print stylesheet exactly once per mount so `window.print()`
  // picks up the @media print rules even though the preview itself is
  // rendered inside a normal scrollable container.
  useEffect(() => {
    const styleId = 'home-book-print-styles'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      ${HOME_BOOK_STYLES}
      @media print {
        body * { visibility: hidden !important; }
        #home-book-print-root, #home-book-print-root * { visibility: visible !important; }
        #home-book-print-root {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: auto !important;
          background: #fff !important;
        }
      }
    `
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  if (!property || !data) {
    return (
      <div className="space-y-3 max-w-2xl">
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
          Home Book
        </h1>
        <p className="text-sm text-muted">Select a property to generate a Home Book.</p>
      </div>
    )
  }

  const enabledList = HOME_BOOK_SECTIONS
    .filter(s => enabled.has(s.id))
    .filter(s => sectionHasData(data, s.id))
  const enabledIds  = enabledList.map(s => s.id)

  const bodyHtml = renderHomeBookBody(data, { sections: enabledIds })
  const fullHtml = renderHomeBookHtml(data, { sections: enabledIds })

  function toggleSection(id: HomeBookSectionId): void {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handlePrint(): void {
    window.print()
  }

  function handleDownload(): void {
    if (!data) return
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = homeBookFilename(data, 'html')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleShareToDrive(): Promise<void> {
    if (!data) return
    if (!property.driveRootFolderId) {
      setShare({ kind: 'error', message: 'No Drive root folder configured for this property.' })
      return
    }
    setShare({ kind: 'sharing' })
    try {
      const token = await getValidToken()
      if (!token) {
        setShare({ kind: 'error', message: 'Not signed in to Google Drive.' })
        return
      }
      const filename = homeBookFilename(data, 'html')
      const file = await DriveClient.uploadFile(
        token,
        property.driveRootFolderId,
        filename,
        fullHtml,
        'text/html',
      )
      setShare({ kind: 'shared', filename, webViewLink: file.webViewLink })
    } catch (err) {
      setShare({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const totalSections   = HOME_BOOK_SECTIONS.length
  const populatedCount  = HOME_BOOK_SECTIONS.filter(s => sectionHasData(data, s.id)).length
  const includedCount   = enabledList.length

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
          Home Book
        </h1>
        <p className="text-sm text-muted mt-0.5">
          A complete printable record for <strong>{property.name}</strong>. Hand it to a buyer,
          insurance adjuster, or contractor.
        </p>
      </div>

      {/* Action bar */}
      <div className="card-surface rounded-2xl p-4 shadow-sm space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Prepared by</span>
            <input
              value={preparedBy}
              onChange={e => setPreparedBy(e.target.value)}
              className="mt-1 w-full text-sm input-surface rounded-xl px-3 py-2"
              placeholder="Owner name"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:justify-end sm:items-end">
            <button
              onClick={handlePrint}
              className="btn btn-info btn-md gap-2"
              type="button"
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
            <button
              onClick={handleDownload}
              className="btn btn-md gap-2 border border-slate-300 dark:border-slate-600 text-primary hover:bg-slate-100 dark:hover:bg-slate-700"
              type="button"
            >
              <Download className="w-4 h-4" /> Download HTML
            </button>
            <button
              onClick={handleShareToDrive}
              disabled={share.kind === 'sharing'}
              className="btn btn-md gap-2 border border-slate-300 dark:border-slate-600 text-primary hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
              type="button"
            >
              {share.kind === 'sharing'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : <><UploadCloud className="w-4 h-4" /> Share to Drive</>}
            </button>
          </div>
        </div>

        {share.kind === 'shared' && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-3 py-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-emerald-800 dark:text-emerald-200">
              Uploaded as <strong>{share.filename}</strong>
              {share.webViewLink && (
                <>
                  {' — '}
                  <a href={share.webViewLink} target="_blank" rel="noreferrer" className="underline">open in Drive</a>
                </>
              )}
            </span>
          </div>
        )}
        {share.kind === 'error' && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <span className="text-red-800 dark:text-red-200">{share.message}</span>
          </div>
        )}
      </div>

      {/* Section visibility toggles */}
      <div className="card-surface rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Sections</span>
          <span className="text-xs text-subtle">
            {includedCount} of {populatedCount} populated · {totalSections} total
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {HOME_BOOK_SECTIONS.map(s => {
            const populated = sectionHasData(data, s.id)
            const checked   = enabled.has(s.id)
            return (
              <label
                key={s.id}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                  checked
                    ? 'border-green-400 bg-green-50/60 dark:bg-green-900/15'
                    : 'border-slate-200 dark:border-slate-700'
                } ${!populated ? 'opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSection(s.id)}
                  className="mt-1 accent-green-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-primary">{s.title}</div>
                  <div className="text-xs text-subtle truncate">
                    {populated ? s.description : 'No data on record'}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* Live preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Preview</span>
          <span className="text-xs text-subtle">
            Print-to-PDF uses the same layout, paginated for Letter / A4.
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900/40">
          <div className="max-h-[80vh] overflow-y-auto py-6">
            <div
              id="home-book-print-root"
              className="mx-auto bg-white shadow-md rounded-md"
              style={{ maxWidth: '8.5in' }}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
