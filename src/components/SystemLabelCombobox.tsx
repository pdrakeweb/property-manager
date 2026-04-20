import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '../utils/cn'
import { localIndex } from '../lib/localIndex'
import { CATEGORIES } from '../data/categories'

interface Props {
  value: string
  onChange: (value: string) => void
  propertyId: string
  className?: string
}

export function SystemLabelCombobox({ value, onChange, propertyId, className }: Props) {
  const [open, setOpen]     = useState(false)
  const [input, setInput]   = useState(value)
  const ref                 = useRef<HTMLDivElement>(null)

  // Sync controlled value into local input when parent changes it externally
  useEffect(() => { setInput(value) }, [value])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        // Commit whatever the user typed
        onChange(input.trim())
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [input, onChange])

  // Build suggestion list: equipment titles + category labels, deduplicated
  const equipmentTitles = localIndex.getAll('equipment', propertyId).map(r => r.title)
  const categoryLabels  = CATEGORIES.map(c => c.label)
  const all             = Array.from(new Set([...equipmentTitles, ...categoryLabels]))

  const q = input.trim().toLowerCase()
  const suggestions = q
    ? all.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
    : all

  function select(s: string) {
    setInput(s)
    onChange(s)
    setOpen(false)
  }

  function handleInputChange(v: string) {
    setInput(v)
    onChange(v)
    setOpen(true)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className={cn(
        'flex items-center input-surface rounded-xl px-3 py-2.5 gap-2',
        open && 'ring-2 ring-sky-300 border-sky-300',
      )}>
        <input
          type="text"
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="HVAC, Generator, Roof…"
          className="flex-1 text-sm focus:outline-none bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen(o => !o)}
          className="text-slate-400 shrink-0"
        >
          <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 modal-surface border border-slate-200 dark:border-slate-700 rounded-xl z-50 overflow-hidden shadow-lg">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400">Select or keep typing</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => select(s)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100',
                  s === value && 'bg-sky-50 dark:bg-sky-900/30',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
