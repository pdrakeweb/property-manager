import { useMemo, useRef, useState } from 'react'
import {
  Plus, Search, X, Package, Edit2, Trash2, Camera, Upload,
  Sparkles, Download, FileText, Star,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAppStore } from '../store/AppStoreContext'
import { useToast } from '../components/Toast'
import { useModalA11y } from '../lib/focusTrap'
import { contentsStore } from '../lib/contentsStore'
import {
  CONTENT_CATEGORIES, contentCategoryLabel,
  type ContentCategory, type ContentItem,
} from '../records/contentItem'
import { estimateContentValue, type ContentValueEstimate } from '../lib/contentValueAi'
import {
  buildInsuranceCsv, buildHtmlReport, downloadFile, importContentsCsv,
} from '../lib/contentsExport'

const CATEGORY_FILTERS: Array<ContentCategory | 'all'> = ['all', ...CONTENT_CATEGORIES]

const inp = 'w-full text-sm input-surface rounded-xl px-3 py-2.5'

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ItemFormState {
  name:           string
  category:       ContentCategory
  location:       string
  quantity:       string
  brand:          string
  model:          string
  serialNumber:   string
  purchaseDate:   string
  purchasePrice:  string
  currentValue:   string
  insuredValue:   string
  warrantyExpiry: string
  condition:      number
  notes:          string
  photos:         string[]
  receiptDriveId: string
}

function emptyForm(): ItemFormState {
  return {
    name: '', category: 'other', location: '', quantity: '1',
    brand: '', model: '', serialNumber: '',
    purchaseDate: '', purchasePrice: '', currentValue: '', insuredValue: '',
    warrantyExpiry: '', condition: 3, notes: '', photos: [], receiptDriveId: '',
  }
}

function itemToForm(i: ContentItem): ItemFormState {
  return {
    name:           i.name,
    category:       i.category,
    location:       i.location ?? '',
    quantity:       String(i.quantity ?? 1),
    brand:          i.brand ?? '',
    model:          i.model ?? '',
    serialNumber:   i.serialNumber ?? '',
    purchaseDate:   i.purchaseDate ?? '',
    purchasePrice:  i.purchasePrice  != null ? String(i.purchasePrice)  : '',
    currentValue:   i.currentValue   != null ? String(i.currentValue)   : '',
    insuredValue:   i.insuredValue   != null ? String(i.insuredValue)   : '',
    warrantyExpiry: i.warrantyExpiry ?? '',
    condition:      i.condition ?? 3,
    notes:          i.notes ?? '',
    photos:         i.photos ?? [],
    receiptDriveId: i.receiptDriveId ?? '',
  }
}

function ConditionStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Condition ${n}`}
          className={cn('p-0.5 rounded-md', n <= value ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600')}
        >
          <Star className="w-5 h-5 fill-current" />
        </button>
      ))}
    </div>
  )
}

interface ItemModalProps {
  initial?: ContentItem
  onSave:   (draft: Omit<ContentItem, 'id' | 'propertyId'>) => void
  onClose:  () => void
}

function ItemModal({ initial, onSave, onClose }: ItemModalProps) {
  const [form, setForm] = useState<ItemFormState>(initial ? itemToForm(initial) : emptyForm())
  const [aiBusy,    setAiBusy]    = useState(false)
  const [aiResult,  setAiResult]  = useState<ContentValueEstimate | null>(null)
  const [aiError,   setAiError]   = useState<string | null>(null)
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)
  const photoInputRef   = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  function set<K extends keyof ItemFormState>(k: K, v: ItemFormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function addPhotos(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const url = ev.target?.result as string
        if (!url) return
        setForm(f => ({ ...f, photos: [...f.photos, url] }))
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(idx: number) {
    setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))
  }

  function attachReceipt(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      if (url) set('receiptDriveId', url)   // local data URL until Drive upload lands
    }
    reader.readAsDataURL(file)
  }

  async function runAiEstimate() {
    if (form.photos.length === 0) {
      setAiError('Add at least one photo first.')
      return
    }
    setAiBusy(true)
    setAiError(null)
    setAiResult(null)
    try {
      const draftItem: ContentItem = {
        id: initial?.id ?? 'draft',
        propertyId: initial?.propertyId ?? '',
        name:          form.name || 'Item',
        category:      form.category,
        location:      form.location,
        quantity:      Number.parseInt(form.quantity, 10) || 1,
        brand:         form.brand || undefined,
        model:         form.model || undefined,
        serialNumber:  form.serialNumber || undefined,
        purchaseDate:  form.purchaseDate || undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        currentValue:  form.currentValue  ? Number(form.currentValue)  : undefined,
        insuredValue:  form.insuredValue  ? Number(form.insuredValue)  : undefined,
        warrantyExpiry:form.warrantyExpiry || undefined,
        condition:     form.condition,
        notes:         form.notes || undefined,
        photos:        form.photos,
      }
      const result = await estimateContentValue({ photoDataUrls: form.photos, item: draftItem })
      setAiResult(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }

  function applyAiEstimate() {
    if (!aiResult) return
    set('currentValue', String(Math.round(aiResult.estimatedValue)))
    toast.success(`Set current value to $${Math.round(aiResult.estimatedValue).toLocaleString()}`)
  }

  function submit() {
    const name = form.name.trim()
    if (!name) return
    const qty = Number.parseInt(form.quantity, 10)
    onSave({
      name,
      category:      form.category,
      location:      form.location.trim(),
      quantity:      Number.isFinite(qty) && qty > 0 ? qty : 1,
      brand:         form.brand.trim() || undefined,
      model:         form.model.trim() || undefined,
      serialNumber:  form.serialNumber.trim() || undefined,
      purchaseDate:  form.purchaseDate || undefined,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
      currentValue:  form.currentValue  ? Number(form.currentValue)  : undefined,
      insuredValue:  form.insuredValue  ? Number(form.insuredValue)  : undefined,
      warrantyExpiry:form.warrantyExpiry || undefined,
      condition:     form.condition,
      notes:         form.notes.trim() || undefined,
      photos:        form.photos.length > 0 ? form.photos : undefined,
      receiptDriveId:form.receiptDriveId || undefined,
    })
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-form-modal-title"
        className="modal-surface rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="content-form-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initial ? 'Edit Item' : 'Add Item'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Photos */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Photos</label>
          {form.photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {form.photos.map((p, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="Remove photo"
                    className="absolute top-0.5 right-0.5 bg-slate-900/70 text-white rounded-full p-0.5 opacity-80 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple
              className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="btn btn-secondary btn-sm flex-1"
            >
              <Camera className="w-4 h-4" />
              Add photo
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Samsung 65&quot; QLED TV" className={inp} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value as ContentCategory)} className={inp}>
              {CONTENT_CATEGORIES.map(c => (
                <option key={c} value={c}>{contentCategoryLabel(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Living room" className={inp} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Qty</label>
            <input type="number" min="1" step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} className={inp} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Condition</label>
            <ConditionStars value={form.condition} onChange={n => set('condition', n)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand</label>
            <input value={form.brand} onChange={e => set('brand', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Model</label>
            <input value={form.model} onChange={e => set('model', e.target.value)} className={inp} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Serial #</label>
          <input value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} className={inp} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Purchase Date</label>
            <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Purchase Price ($)</label>
            <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} className={inp} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current Value ($)</label>
            <input type="number" min="0" step="0.01" value={form.currentValue} onChange={e => set('currentValue', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Insured Value ($)</label>
            <input type="number" min="0" step="0.01" value={form.insuredValue} onChange={e => set('insuredValue', e.target.value)} className={inp} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Warranty Until</label>
          <input type="date" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} className={inp} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inp} resize-none`} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Receipt</label>
          <input
            ref={receiptInputRef} type="file" accept="image/*,application/pdf"
            className="hidden" onChange={e => { attachReceipt(e.target.files?.[0]); e.target.value = '' }}
          />
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            className="btn btn-secondary btn-sm w-full"
          >
            <Upload className="w-4 h-4" />
            {form.receiptDriveId ? 'Replace receipt' : 'Attach receipt'}
          </button>
          {form.receiptDriveId && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Receipt attached.</p>
          )}
        </div>

        {/* AI value estimate */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">AI Value Estimate</p>
            <button
              type="button"
              onClick={runAiEstimate}
              disabled={aiBusy}
              className="btn btn-info btn-sm"
            >
              <Sparkles className="w-4 h-4" />
              {aiBusy ? 'Estimating…' : 'Estimate'}
            </button>
          </div>
          {aiError && (
            <p className="text-xs text-red-500 dark:text-red-400">{aiError}</p>
          )}
          {aiResult && (
            <div className="space-y-1.5 bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ${Math.round(aiResult.estimatedValue).toLocaleString()}
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  range ${Math.round(aiResult.valueRange.low).toLocaleString()}–${Math.round(aiResult.valueRange.high).toLocaleString()} · {aiResult.confidence} confidence
                </span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{aiResult.rationale}</p>
              {aiResult.notes && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{aiResult.notes}</p>
              )}
              <button
                type="button"
                onClick={applyAiEstimate}
                className="text-xs font-semibold text-green-600 dark:text-green-400 hover:underline"
              >
                Apply to current value
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={!form.name.trim()} className="btn btn-info flex-1">Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function ContentsScreen() {
  const { activePropertyId, properties } = useAppStore()
  const activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const toast = useToast()
  const csvInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems]     = useState<ContentItem[]>(() => contentsStore.getAll())
  const [search, setSearch]   = useState('')
  const [catFilter, setCatFilter]   = useState<ContentCategory | 'all'>('all')
  const [roomFilter, setRoomFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<ContentItem | undefined>()

  function refresh() { setItems(contentsStore.getAll()) }

  const propertyItems = useMemo(
    () => items.filter(i => i.propertyId === activePropertyId),
    [items, activePropertyId],
  )

  // Distinct rooms across the active property's items, alphabetised.
  const roomOptions = useMemo(() => {
    const rooms = new Set<string>()
    for (const i of propertyItems) {
      const r = (i.location ?? '').trim()
      if (r) rooms.add(r)
    }
    return [...rooms].sort((a, b) => a.localeCompare(b))
  }, [propertyItems])

  const visibleItems = useMemo(() => propertyItems.filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false
    if (roomFilter !== 'all' && (i.location ?? '').trim() !== roomFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [i.name, i.brand, i.model, i.location, i.serialNumber, i.notes]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [propertyItems, catFilter, roomFilter, search])

  // Group visible items by category for display.
  const grouped = useMemo(() => {
    const map = new Map<ContentCategory, ContentItem[]>()
    for (const c of CONTENT_CATEGORIES) map.set(c, [])
    for (const i of visibleItems) map.get(i.category)?.push(i)
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [visibleItems])

  const totals = useMemo(() => {
    const totalCount   = propertyItems.reduce((s, i) => s + (i.quantity ?? 1), 0)
    const totalValue   = propertyItems.reduce((s, i) => s + (i.currentValue ?? 0), 0)
    const totalInsured = propertyItems.reduce((s, i) => s + (i.insuredValue ?? 0), 0)
    return { totalCount, totalValue, totalInsured }
  }, [propertyItems])

  function handleSave(draft: Omit<ContentItem, 'id' | 'propertyId'>) {
    if (editing) {
      contentsStore.update({ ...editing, ...draft })
      toast.success(`Updated ${draft.name}`)
    } else {
      contentsStore.add({ ...draft, id: crypto.randomUUID(), propertyId: activePropertyId })
      toast.success(`Added ${draft.name}`)
    }
    refresh()
    setShowModal(false)
    setEditing(undefined)
  }

  function handleDelete(item: ContentItem) {
    if (!confirm(`Delete ${item.name}?`)) return
    contentsStore.remove(item.id)
    refresh()
  }

  function exportCsv() {
    if (propertyItems.length === 0) {
      toast.warn('No items to export')
      return
    }
    const csv = buildInsuranceCsv(propertyItems)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`contents-inventory-${activeProperty.shortName}-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
    toast.success(`Exported ${propertyItems.length} items`)
  }

  function exportHtml() {
    if (propertyItems.length === 0) {
      toast.warn('No items to export')
      return
    }
    const html = buildHtmlReport(propertyItems, { propertyName: activeProperty.name })
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`contents-inventory-${activeProperty.shortName}-${stamp}.html`, html, 'text/html;charset=utf-8')
    toast.success(`Exported ${propertyItems.length} items as HTML`)
  }

  function importCsv(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? ''
      const result = importContentsCsv(text)
      if (result.warnings.length > 0 && result.items.length === 0) {
        toast.error(result.warnings[0])
        return
      }
      for (const draft of result.items) {
        contentsStore.add({ ...draft, id: crypto.randomUUID(), propertyId: activePropertyId })
      }
      refresh()
      toast.success(`Imported ${result.items.length} item${result.items.length !== 1 ? 's' : ''}${result.skipped ? ` (skipped ${result.skipped})` : ''}`)
    }
    reader.readAsText(file)
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Home Contents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Personal property inventory for {activeProperty.shortName}
            </p>
          </div>
          <button
            onClick={() => { setEditing(undefined); setShowModal(true) }}
            className="btn btn-info"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Totals bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card-surface rounded-xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{totals.totalCount.toLocaleString()}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Items</div>
          </div>
          <div className="card-surface rounded-xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${totals.totalValue.toLocaleString()}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Estimated value</div>
          </div>
          <div className="card-surface rounded-xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">${totals.totalInsured.toLocaleString()}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Insured</div>
          </div>
        </div>

        {/* Insurance export + CSV import */}
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv}  className="btn btn-secondary btn-sm"><Download className="w-4 h-4" /> Export for Insurance (CSV)</button>
          <button onClick={exportHtml} className="btn btn-secondary btn-sm"><FileText className="w-4 h-4" /> Printable report</button>
          <input
            ref={csvInputRef} type="file" accept=".csv,text/csv"
            className="hidden" onChange={e => { importCsv(e.target.files?.[0]); e.target.value = '' }}
          />
          <button onClick={() => csvInputRef.current?.click()} className="btn btn-secondary btn-sm">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
        </div>

        {/* Search + filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, brand, model, serial…"
              className="w-full pl-10 pr-4 py-2.5 text-sm input-surface rounded-xl"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                  catFilter === c
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                )}
              >
                {c === 'all' ? 'All' : contentCategoryLabel(c)}
              </button>
            ))}
          </div>

          {roomOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">Room:</span>
              {(['all', ...roomOptions]).map(r => (
                <button
                  key={r}
                  onClick={() => setRoomFilter(r)}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1 rounded-lg transition-colors',
                    roomFilter === r
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                  )}
                >
                  {r === 'all' ? 'All' : r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        {propertyItems.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-12 h-12 text-slate-200 dark:text-slate-600 mx-auto" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No items recorded yet.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Tap <span className="font-semibold">Add Item</span> or <span className="font-semibold">Import CSV</span> to get started.
            </p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">
            No items match the current filters.
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([category, list]) => {
              const subtotal = list.reduce((s, i) => s + (i.currentValue ?? 0), 0)
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {contentCategoryLabel(category)} <span className="text-slate-400 dark:text-slate-500">({list.length})</span>
                    </h2>
                    {subtotal > 0 && (
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">${subtotal.toLocaleString()}</span>
                    )}
                  </div>
                  <div className="card-surface rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                    {list.map(item => (
                      <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                        {item.photos && item.photos[0] ? (
                          <img src={item.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 dark:bg-slate-700 shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {item.location || 'Unspecified room'}
                            {item.quantity && item.quantity > 1 ? ` · qty ${item.quantity}` : ''}
                            {item.brand ? ` · ${item.brand}` : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.currentValue != null && (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                ${item.currentValue.toLocaleString()}
                              </span>
                            )}
                            <span className="flex">
                              {[1, 2, 3, 4, 5].map(n => (
                                <Star
                                  key={n}
                                  className={cn(
                                    'w-3 h-3 fill-current',
                                    n <= item.condition ? 'text-amber-400' : 'text-slate-200 dark:text-slate-600',
                                  )}
                                />
                              ))}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditing(item); setShowModal(true) }}
                            aria-label="Edit"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            aria-label="Delete"
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <ItemModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(undefined) }}
        />
      )}
    </>
  )
}
