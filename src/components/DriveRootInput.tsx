import { useState, useEffect, useRef } from 'react'
import { Folder, FolderOpen, ChevronRight, Loader2, X } from 'lucide-react'
import { DriveClient } from '../lib/driveClient'
import { localDriveAdapter } from '../lib/localDriveAdapter'
import { getValidToken } from '../auth/oauth'
import type { DriveFile } from '../lib/driveClient'
import { cn } from '../utils/cn'

function drive(): typeof DriveClient {
  return localStorage.getItem('google_access_token') === 'dev_token'
    ? (localDriveAdapter as typeof DriveClient)
    : DriveClient
}

/** Extract a Drive folder ID from a URL like https://drive.google.com/drive/folders/ABC123 */
function parseDriveUrl(input: string): string | null {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]{10,})/)
  return m ? m[1] : null
}

interface BrowseEntry { id: string; name: string }

interface Props {
  value: string
  onChange: (id: string) => void
}

export function DriveRootInput({ value, onChange }: Props) {
  const [text, setText]               = useState(value)
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [resolving, setResolving]     = useState(false)
  const [pickerOpen, setPickerOpen]   = useState(false)

  useEffect(() => { setText(value) }, [value])

  // Resolve folder name whenever a plausible ID is in the field
  useEffect(() => {
    const id = text.trim()
    if (!id || id.length < 10) { setResolvedName(null); return }
    let cancelled = false
    setResolving(true)
    getValidToken()
      .then(token => token ? drive().getFolderName(token, id) : null)
      .then(name  => { if (!cancelled) setResolvedName(name ?? null) })
      .catch(()   => { if (!cancelled) setResolvedName(null) })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [text])

  function commit(raw: string) {
    const extracted = parseDriveUrl(raw) ?? raw
    setText(extracted)
    onChange(extracted)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    const extracted = parseDriveUrl(pasted)
    if (extracted) {
      e.preventDefault()
      commit(extracted)
    }
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex gap-1">
        <input
          className="flex-1 min-w-0 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-300 font-mono placeholder:font-sans"
          value={text}
          onChange={e => commit(e.target.value)}
          onPaste={handlePaste}
          placeholder="Paste Drive URL or folder ID…"
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 shrink-0"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Browse
        </button>
      </div>

      {resolving && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Resolving folder…
        </p>
      )}
      {resolvedName && !resolving && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
          <Folder className="w-3 h-3" /> {resolvedName}
        </p>
      )}

      {pickerOpen && (
        <DriveFolderModal
          onSelect={(id, name) => { commit(id); setResolvedName(name); setPickerOpen(false) }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function DriveFolderModal({
  onSelect,
  onCancel,
}: {
  onSelect: (id: string, name: string) => void
  onCancel: () => void
}) {
  const [stack,   setStack]   = useState<BrowseEntry[]>([{ id: 'root', name: 'My Drive' }])
  const [folders, setFolders] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const tokenRef = useRef<string | null>(null)

  const current = stack[stack.length - 1]

  useEffect(() => {
    getValidToken().then(t => {
      tokenRef.current = t
      if (t) loadFolders(t, 'root')
      else setError('Not signed in')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadFolders(token: string, parentId: string) {
    setLoading(true)
    setError('')
    drive()
      .listFolders(token, parentId)
      .then(f  => setFolders(f))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  function navigateInto(f: DriveFile) {
    const newStack = [...stack, { id: f.id, name: f.name }]
    setStack(newStack)
    if (tokenRef.current) loadFolders(tokenRef.current, f.id)
  }

  function navigateTo(index: number) {
    const newStack = stack.slice(0, index + 1)
    setStack(newStack)
    if (tokenRef.current) loadFolders(tokenRef.current, newStack[newStack.length - 1].id)
  }

  return (
    <div className="modal-backdrop items-center bg-black/50 backdrop-blur-sm pb-0">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Choose a Drive folder</p>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 flex items-center gap-0.5 flex-wrap bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
          {stack.map((entry, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
              <button
                onClick={() => navigateTo(i)}
                className={cn(
                  'text-xs px-1 py-0.5 rounded',
                  i === stack.length - 1
                    ? 'font-semibold text-slate-700 dark:text-slate-300 cursor-default'
                    : 'text-green-600 dark:text-green-400 hover:underline',
                )}
              >
                {entry.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="overflow-y-auto min-h-[8rem] max-h-64">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-xs text-red-500 text-center">{error}</div>
          ) : folders.length === 0 ? (
            <div className="px-4 py-6 text-xs text-slate-400 dark:text-slate-500 text-center">
              No subfolders here
            </div>
          ) : (
            folders.map(f => (
              <button
                key={f.id}
                onClick={() => navigateInto(f)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-50 dark:border-slate-700/40 last:border-0"
              >
                <Folder className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                <span className="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(current.id, current.name)}
            className="btn btn-primary btn-sm"
          >
            Select "{current.name}"
          </button>
        </div>
      </div>
    </div>
  )
}
