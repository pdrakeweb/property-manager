import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera, Upload, Sparkles, CheckCircle2, AlertCircle,
  Loader2, X, ChevronLeft, Cloud, Image as ImageIcon, WifiOff,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES, PROPERTIES } from '../data/mockData'
import { getValidToken } from '../auth/oauth'
import { DriveClient } from '../lib/driveClient'
import { formatFileStem, formatRecord } from '../lib/markdownFormatter'
import { enqueue } from '../lib/offlineQueue'
import type { Category } from '../types'

// ── Field definitions ────────────────────────────────────────────────────────

type FieldDef = {
  id: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'
  options?: string[]
  unit?: string
  placeholder?: string
}

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  generator: [
    { id: 'brand',               label: 'Brand',                type: 'text'     },
    { id: 'model',               label: 'Model Name',           type: 'text'     },
    { id: 'model_number',        label: 'Model Number',         type: 'text'     },
    { id: 'serial_number',       label: 'Serial Number',        type: 'text'     },
    { id: 'kw_rating',           label: 'Output',               type: 'number',  unit: 'kW'  },
    { id: 'fuel_type',           label: 'Fuel Type',            type: 'select',  options: ['Propane', 'Natural Gas', 'Gasoline', 'Diesel'] },
    { id: 'transfer_switch_brand', label: 'Transfer Switch Brand', type: 'text' },
    { id: 'transfer_switch_amps',  label: 'Transfer Switch Amps',  type: 'number', unit: 'A' },
    { id: 'oil_type',            label: 'Engine Oil Type',      type: 'text',    placeholder: 'e.g. 5W-30 Synthetic' },
    { id: 'oil_capacity_qt',     label: 'Oil Capacity',         type: 'number',  unit: 'qt' },
    { id: 'air_filter_part',     label: 'Air Filter Part #',    type: 'text'     },
    { id: 'last_service_date',   label: 'Last Service Date',    type: 'date'     },
    { id: 'notes',               label: 'Notes',                type: 'textarea' },
  ],
  hvac: [
    { id: 'unit_type',     label: 'Unit Type',        type: 'select', options: ['Furnace', 'Air Conditioner', 'Heat Pump', 'Air Handler', 'Mini-Split'] },
    { id: 'unit_label',    label: 'Zone / Label',     type: 'text',   placeholder: 'e.g. Main Floor, Sunroom' },
    { id: 'brand',         label: 'Brand',            type: 'text'     },
    { id: 'model',         label: 'Model Number',     type: 'text'     },
    { id: 'serial_number', label: 'Serial Number',    type: 'text'     },
    { id: 'install_date',  label: 'Install Date',     type: 'date'     },
    { id: 'tonnage',       label: 'Cooling Tonnage',  type: 'number',  unit: 'tons' },
    { id: 'seer',          label: 'SEER Rating',      type: 'number'   },
    { id: 'refrigerant_type', label: 'Refrigerant',  type: 'select',  options: ['R-410A', 'R-32', 'R-22', 'R-454B'] },
    { id: 'filter_size',   label: 'Filter Size',      type: 'text',    placeholder: 'e.g. 20×25×4' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  water_heater: [
    { id: 'brand',         label: 'Brand',            type: 'text'   },
    { id: 'model',         label: 'Model Number',     type: 'text'   },
    { id: 'serial_number', label: 'Serial Number',    type: 'text'   },
    { id: 'fuel_type',     label: 'Fuel Type',        type: 'select', options: ['Natural Gas', 'Propane', 'Electric', 'Heat Pump', 'Tankless Gas'] },
    { id: 'tank_gallons',  label: 'Tank Capacity',    type: 'number', unit: 'gal' },
    { id: 'btu_input',     label: 'BTU Input',        type: 'number', unit: 'BTU' },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  water_treatment: [
    { id: 'system_type',   label: 'System Type',      type: 'select', options: ['Water Softener', 'Iron Filter', 'UV Disinfection', 'RO System', 'Whole House Filter'] },
    { id: 'brand',         label: 'Brand',            type: 'text'   },
    { id: 'model',         label: 'Model Number',     type: 'text'   },
    { id: 'serial_number', label: 'Serial Number',    type: 'text'   },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'location',      label: 'Location',         type: 'text',  placeholder: 'e.g. Utility room' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  appliance: [
    { id: 'appliance_type', label: 'Appliance Type', type: 'select', options: ['Refrigerator', 'Dishwasher', 'Range/Oven', 'Microwave', 'Washer', 'Dryer', 'Freezer', 'Garbage Disposal', 'Garage Door Opener', 'Other'] },
    { id: 'brand',          label: 'Brand',          type: 'text'   },
    { id: 'model',          label: 'Model Number',   type: 'text'   },
    { id: 'serial_number',  label: 'Serial Number',  type: 'text'   },
    { id: 'install_date',   label: 'Purchase / Install Date', type: 'date' },
    { id: 'location',       label: 'Location',       type: 'text',  placeholder: 'e.g. Kitchen, Garage' },
    { id: 'notes',          label: 'Notes',          type: 'textarea' },
  ],
  propane: [
    { id: 'supplier',      label: 'Supplier',         type: 'text',  placeholder: 'e.g. Ferrellgas' },
    { id: 'tank_gallons',  label: 'Tank Capacity',    type: 'number', unit: 'gal' },
    { id: 'ownership',     label: 'Tank Ownership',   type: 'select', options: ['Owned', 'Rented/Leased'] },
    { id: 'tank_age_year', label: 'Tank Year',        type: 'number', placeholder: 'e.g. 2006' },
    { id: 'location',      label: 'Location',         type: 'text',  placeholder: 'e.g. South yard' },
    { id: 'account_number', label: 'Account Number',  type: 'text'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  well: [
    { id: 'pump_brand',    label: 'Pump Brand',       type: 'text'   },
    { id: 'pump_model',    label: 'Pump Model',       type: 'text'   },
    { id: 'pump_hp',       label: 'Pump HP',          type: 'number', unit: 'HP' },
    { id: 'well_depth_ft', label: 'Well Depth',       type: 'number', unit: 'ft' },
    { id: 'tank_brand',    label: 'Pressure Tank Brand', type: 'text' },
    { id: 'tank_gallons',  label: 'Tank Capacity',    type: 'number', unit: 'gal' },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  septic: [
    { id: 'tank_gallons',  label: 'Tank Capacity',    type: 'number', unit: 'gal' },
    { id: 'tank_material', label: 'Tank Material',    type: 'select', options: ['Concrete', 'Fiberglass', 'Plastic'] },
    { id: 'last_pumped',   label: 'Last Pumped',      type: 'date'   },
    { id: 'pump_company',  label: 'Pump Company',     type: 'text'   },
    { id: 'drainfield_info', label: 'Drainfield Info', type: 'textarea' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  electrical: [
    { id: 'panel_type',    label: 'Panel Type',       type: 'select', options: ['Main Panel', 'Sub Panel'] },
    { id: 'brand',         label: 'Brand',            type: 'text',  placeholder: 'e.g. Square D, Eaton' },
    { id: 'amps',          label: 'Amperage',         type: 'number', unit: 'A' },
    { id: 'circuits',      label: 'Circuit Count',    type: 'number' },
    { id: 'location',      label: 'Location',         type: 'text',  placeholder: 'e.g. Basement utility room' },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'notes',         label: 'Notes / Circuit Directory', type: 'textarea' },
  ],
  roof: [
    { id: 'section',       label: 'Section / Area',   type: 'text',  placeholder: 'e.g. Main House, Barn, Addition' },
    { id: 'material',      label: 'Material',         type: 'select', options: ['Asphalt Shingle', 'Metal Standing Seam', 'Metal Corrugated', 'EPDM Rubber', 'TPO', 'Cedar Shake', 'Slate', 'Other'] },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'contractor',    label: 'Contractor',       type: 'text'   },
    { id: 'warranty_years', label: 'Warranty Years',  type: 'number', unit: 'yr' },
    { id: 'color',         label: 'Color / Style',    type: 'text'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  sump_pump: [
    { id: 'pump_type',     label: 'Pump Type',        type: 'select', options: ['Primary Electric', 'Battery Backup', 'Water-Powered Backup'] },
    { id: 'brand',         label: 'Brand',            type: 'text'   },
    { id: 'model',         label: 'Model',            type: 'text'   },
    { id: 'hp',            label: 'HP Rating',        type: 'number', unit: 'HP' },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'location',      label: 'Pit Location',     type: 'text'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  radon: [
    { id: 'contractor',    label: 'Installer',        type: 'text'   },
    { id: 'install_date',  label: 'Install Date',     type: 'date'   },
    { id: 'fan_brand',     label: 'Fan Brand/Model',  type: 'text'   },
    { id: 'last_test_level', label: 'Last Test Level', type: 'number', unit: 'pCi/L' },
    { id: 'last_test_date',  label: 'Last Test Date',  type: 'date'   },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  barn: [
    { id: 'structure_year', label: 'Built / Estimated Year', type: 'number' },
    { id: 'size_sqft',     label: 'Square Footage',   type: 'number', unit: 'sq ft' },
    { id: 'electrical',    label: 'Electrical',       type: 'text',  placeholder: 'e.g. 100A sub-panel, 4 circuits' },
    { id: 'roof_material', label: 'Roof Material',    type: 'text'   },
    { id: 'condition',     label: 'Overall Condition', type: 'select', options: ['Good', 'Fair', 'Poor', 'Needs Attention'] },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  surveillance: [
    { id: 'camera_brand',  label: 'Camera Brand',     type: 'text',  placeholder: 'e.g. Reolink, Hikvision' },
    { id: 'camera_model',  label: 'Camera Model',     type: 'text'   },
    { id: 'location',      label: 'Camera Location',  type: 'text',  placeholder: 'e.g. Driveway, Back door' },
    { id: 'resolution',    label: 'Resolution',       type: 'select', options: ['1080p', '4MP', '4K/8MP', 'Other'] },
    { id: 'nvr_brand',     label: 'NVR/DVR Brand',    type: 'text'   },
    { id: 'ip_address',    label: 'IP Address',       type: 'text',  placeholder: 'e.g. 192.168.1.x' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  forestry_cauv: [
    { id: 'record_type',   label: 'Record Type',      type: 'select', options: ['CAUV Renewal', 'Timber Harvest', 'Tree Planting', 'Forest Management Plan', 'Boundary Survey', 'Other'] },
    { id: 'date',          label: 'Activity Date',    type: 'date'   },
    { id: 'acres',         label: 'Acres Affected',   type: 'number', unit: 'ac' },
    { id: 'contractor',    label: 'Contractor / Agency', type: 'text' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  service_record: [
    { id: 'system',        label: 'System / Area',    type: 'text',  placeholder: 'e.g. Generator, HVAC, Well' },
    { id: 'date',          label: 'Service Date',     type: 'date'   },
    { id: 'contractor',    label: 'Contractor',       type: 'text'   },
    { id: 'work_done',     label: 'Work Performed',   type: 'textarea', placeholder: 'Describe what was done' },
    { id: 'cost',          label: 'Total Cost',       type: 'number', unit: '$' },
    { id: 'invoice_ref',   label: 'Invoice Reference', type: 'text'  },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
}

const DEFAULT_FIELDS: FieldDef[] = [
  { id: 'brand',         label: 'Brand',         type: 'text'     },
  { id: 'model',         label: 'Model Number',  type: 'text'     },
  { id: 'serial_number', label: 'Serial Number', type: 'text'     },
  { id: 'install_date',  label: 'Install Date',  type: 'date'     },
  { id: 'notes',         label: 'Notes',         type: 'textarea' },
]

// ── Mock extraction per category (demo AI flow) ──────────────────────────────

const MOCK_EXTRACTED: Record<string, Record<string, string>> = {
  generator: {
    brand: 'Generac', model: '22kW Air-Cooled', model_number: '7043',
    serial_number: '7234891042', kw_rating: '22', fuel_type: 'Propane',
    transfer_switch_brand: 'Generac', transfer_switch_amps: '200',
    oil_type: '5W-30 Synthetic', oil_capacity_qt: '1.7', air_filter_part: '0G8442',
  },
  hvac: {
    unit_type: 'Air Conditioner', brand: 'Trane', model: 'XR15',
    serial_number: '2194XE31T', tonnage: '3', seer: '15', refrigerant_type: 'R-410A',
  },
  water_heater: {
    brand: 'Rheem', model: 'PROG50-38N RH67', serial_number: '0908M4J12345',
    fuel_type: 'Propane', tank_gallons: '50', btu_input: '38000',
  },
}

// ── Photo capture state ──────────────────────────────────────────────────────

interface CapturedPhoto {
  name:     string
  blob:     Blob
  preview:  string // object URL for display
}

// ── Component ────────────────────────────────────────────────────────────────

type AIState   = 'idle' | 'extracting' | 'done' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

export function EquipmentFormScreen() {
  const { categoryId = 'generator' } = useParams<{ categoryId: string }>()
  const navigate = useNavigate()

  const category = CATEGORIES.find(c => c.id === categoryId) as Category | undefined
  const fields   = CATEGORY_FIELDS[categoryId] ?? DEFAULT_FIELDS

  const [aiState,    setAiState]    = useState<AIState>('idle')
  const [values,     setValues]     = useState<Record<string, string>>({})
  const [photos,     setPhotos]     = useState<CapturedPhoto[]>([])
  const [saveState,  setSaveState]  = useState<SaveState>('idle')
  const [saveError,  setSaveError]  = useState('')
  const [driveLink,  setDriveLink]  = useState('')

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Read active property from localStorage (set by AppShell property switcher)
  const activePropertyId = localStorage.getItem('active_property_id') ?? 'tannerville'
  const activeProperty   = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]

  // ── Photo handlers ─────────────────────────────────────────────────────────

  const handleFilesChosen = useCallback((files: FileList | null, isCamera: boolean) => {
    if (!files || files.length === 0) return
    const newPhotos: CapturedPhoto[] = []
    for (const file of Array.from(files)) {
      newPhotos.push({
        name:    file.name || `photo_${Date.now()}.jpg`,
        blob:    file,
        preview: URL.createObjectURL(file),
      })
    }
    setPhotos(prev => [...prev, ...newPhotos])

    // Trigger AI extraction on camera capture if category supports it
    if (isCamera && category?.hasAIExtraction) {
      setAiState('extracting')
      setTimeout(() => {
        const extracted = MOCK_EXTRACTED[categoryId] ?? {}
        setValues(prev => ({ ...prev, ...extracted }))
        setAiState('done')
      }, 1800)
    }
  }, [category, categoryId])

  function removePhoto(index: number) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  // ── Save to Drive ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveState('saving')
    setSaveError('')

    const capturedAt = new Date()
    const cat: Category = category ?? {
      id: categoryId, label: categoryId, icon: '', description: '',
      propertyTypes: [], allowMultiple: true, hasAIExtraction: false,
    }
    const fileStem   = formatFileStem(cat, values, capturedAt)
    const mdFilename = `${fileStem}.md`
    const mdContent  = formatRecord(
      cat,
      values,
      photos.map(p => p.name),
      capturedAt,
    )

    try {
      const token = await getValidToken()

      if (!token) {
        // Offline: queue the MD record (photos can't be queued as blobs)
        enqueue({
          categoryId,
          rootFolderId: activeProperty.driveRootFolderId,
          filename:     mdFilename,
          mdContent,
          capturedAt:   capturedAt.toISOString(),
        })
        setSaveState('offline')
        return
      }

      const folderId = await DriveClient.resolveFolderId(token, categoryId, activeProperty.driveRootFolderId)

      // Upload the markdown record first
      const mdFile = await DriveClient.uploadFile(token, folderId, mdFilename, mdContent, 'text/markdown')
      setDriveLink(`https://drive.google.com/file/d/${mdFile.id}/view`)

      // Upload each photo
      for (const photo of photos) {
        const ext      = photo.name.split('.').pop() ?? 'jpg'
        const photoName = `${fileStem}_${photo.name}`
        const mime      = photo.blob.type || `image/${ext}`
        await DriveClient.uploadFile(token, folderId, photoName, photo.blob, mime)
      }

      setSaveState('saved')

      // Navigate back after 2s
      setTimeout(() => navigate('/capture'), 2000)

    } catch (err) {
      // Upload failed — queue the MD for later
      enqueue({
        categoryId,
        rootFolderId: activeProperty.driveRootFolderId,
        filename:     mdFilename,
        mdContent,
        capturedAt:   capturedAt.toISOString(),
      })
      setSaveState('offline')
      setSaveError(String(err))
    }
  }

  // ── Success / Offline screens ──────────────────────────────────────────────

  if (saveState === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Saved to Drive</h2>
        <p className="text-sm text-slate-500 mb-1">
          Record uploaded to {category?.label ?? categoryId} folder
        </p>
        <p className="text-xs text-slate-400 mb-4">
          {category?.icon} {values['brand'] || 'Equipment'} {values['model'] || ''} · {new Date().toLocaleDateString()}
        </p>
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-600 hover:text-sky-700 underline mb-6"
          >
            View in Drive ↗
          </a>
        )}
        <p className="text-xs text-slate-400 mb-6">Returning to Capture…</p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors">
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (saveState === 'offline') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <WifiOff className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Saved Offline</h2>
        <p className="text-sm text-slate-500 mb-1">Record queued — will upload when connected.</p>
        {saveError && <p className="text-xs text-slate-400 mb-4 max-w-xs">{saveError}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={() => navigate('/capture')} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors">
            Capture another
          </button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors">
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/capture')}
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {category?.icon} {category?.label ?? categoryId}
          </h1>
          <p className="text-xs text-slate-500">New record · {activeProperty.shortName}</p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, true)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={e => handleFilesChosen(e.target.files, false)}
      />

      {/* Photo Capture Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Photograph Nameplate</h2>
            {category?.hasAIExtraction && (
              <span className="flex items-center gap-1 text-xs text-sky-600">
                <Sparkles className="w-3 h-3" />
                AI extraction
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={aiState === 'extracting'}
              className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Camera
            </button>
            <button
              onClick={() => uploadInputRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>

          {/* AI status banner */}
          {aiState !== 'idle' && (
            <div className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm',
              aiState === 'extracting' && 'bg-sky-50 text-sky-700',
              aiState === 'done'       && 'bg-emerald-50 text-emerald-700',
              aiState === 'error'      && 'bg-red-50 text-red-700',
            )}>
              {aiState === 'extracting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {aiState === 'done'       && <CheckCircle2 className="w-4 h-4" />}
              {aiState === 'error'      && <AlertCircle className="w-4 h-4" />}
              <span className="font-medium">
                {aiState === 'extracting' && 'Extracting specifications…'}
                {aiState === 'done'       && 'Extraction complete — review below'}
                {aiState === 'error'      && 'Extraction failed — fill manually'}
              </span>
            </div>
          )}

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {photos.map((p, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded-lg border border-slate-200 overflow-hidden group bg-slate-100"
                >
                  <img src={p.preview} alt={p.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 text-white rounded-full items-center justify-center hidden group-hover:flex text-xs leading-none"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="w-16 h-16 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Equipment Details</h2>
          {aiState === 'done' && (
            <p className="text-xs text-slate-500 mt-0.5">Fields highlighted in blue were filled by AI — please verify.</p>
          )}
        </div>
        <div className="p-4 space-y-4">
          {fields.map(field => {
            const val          = values[field.id] ?? ''
            const aiFilledStyle = aiState === 'done' && val
              ? 'ring-2 ring-sky-200 border-sky-300'
              : ''
            const baseClass = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition-all placeholder:text-slate-400'

            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {field.label}
                  {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'resize-none', aiFilledStyle)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={val}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, 'bg-white', aiFilledStyle)}
                  >
                    <option value="">Select…</option>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={val === 'true'}
                      onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                    />
                    <span className="text-sm text-slate-600">Yes</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                    value={val}
                    placeholder={field.placeholder}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(baseClass, aiFilledStyle)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex gap-3 pb-4">
        <button
          onClick={() => navigate('/capture')}
          className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="flex-[2] py-3.5 rounded-2xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:bg-sky-400 transition-colors flex items-center justify-center gap-2"
        >
          {saveState === 'saving' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving to Drive…</>
          ) : (
            <><Cloud className="w-4 h-4" /> Save to Drive</>
          )}
        </button>
      </div>

    </div>
  )
}
