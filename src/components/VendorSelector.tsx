import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'
import { cn } from '../utils/cn'
import { vendorStore } from '../lib/vendorStore'

interface VendorSelectorProps {
  value: string
  onChange: (id: string) => void
  propertyId: string
}

const VENDOR_TYPE_LABELS: Record<string, string> = {
  hvac: 'HVAC',
  well: 'Well',
  septic: 'Septic',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  propane: 'Propane',
  roofing: 'Roofing',
  landscaping: 'Landscaping',
  general: 'General',
  other: 'Other',
}

export function VendorSelector({ value, onChange, propertyId }: VendorSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const allVendors = vendorStore.getAll()
  const vendors = allVendors.filter(v =>
    (!propertyId || v.propertyIds.includes(propertyId) || v.propertyIds.length === 0) &&
    (v.name.toLowerCase().includes(search.toLowerCase()) ||
     v.type.toLowerCase().includes(search.toLowerCase()))
  )

  const selected = value ? allVendors.find(v => v.id === value) : undefined

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between text-sm input-surface rounded-xl px-3 py-2.5 text-left',
          open && 'ring-2 ring-sky-300 border-sky-300',
        )}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.name : 'No vendor'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 modal-surface border border-slate-200 dark:border-slate-700 rounded-xl z-50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search vendors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm focus:outline-none text-slate-800 placeholder:text-slate-400"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              className="w-full flex items-center px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-50 text-left"
            >
              No vendor
            </button>
            {vendors.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-400 text-center">No vendors found</div>
            )}
            {vendors.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false); setSearch('') }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50',
                  v.id === value && 'bg-sky-50',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{v.name}</div>
                  {v.phone && <div className="text-xs text-slate-400">{v.phone}</div>}
                </div>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-md px-2 py-0.5 shrink-0">
                  {VENDOR_TYPE_LABELS[v.type] ?? v.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
