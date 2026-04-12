import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera, Upload, Sparkles, CheckCircle2, AlertCircle,
  Loader2, X, ChevronLeft, Cloud, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CATEGORIES } from '../data/mockData'

type AIState = 'idle' | 'extracting' | 'done' | 'error'

// Mock extracted values for generator to demonstrate the AI flow
const MOCK_EXTRACTED: Record<string, Record<string, string>> = {
  generator: {
    brand: 'Generac',
    model: '22kW Air-Cooled',
    model_number: '7043',
    serial_number: '7234891042',
    kw_rating: '22',
    fuel_type: 'Propane',
    transfer_switch_brand: 'Generac',
    transfer_switch_amps: '200',
    transfer_switch_type: 'Automatic',
    oil_type: '5W-30 Synthetic',
    oil_capacity_qt: '1.7',
    air_filter_part: '0G8442',
  },
  hvac: {
    brand: 'Trane',
    model: 'XR15',
    serial_number: '2194XE31T',
    unit_type: 'Air Conditioner',
    tonnage: '3',
    seer: '15',
    refrigerant_type: 'R-410A',
  },
  water_heater: {
    brand: 'Rheem',
    model: 'PROG50-38N RH67',
    serial_number: '0908M4J12345',
    fuel_type: 'Propane',
    tank_gallons: '50',
    btu_input: '38000',
  },
}

// Minimal field definitions per category for the mockup
const CATEGORY_FIELDS: Record<string, Array<{
  id: string; label: string; type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean';
  options?: string[]; unit?: string; placeholder?: string
}>> = {
  generator: [
    { id: 'brand',               label: 'Brand',                type: 'text'     },
    { id: 'model',               label: 'Model Name',           type: 'text'     },
    { id: 'model_number',        label: 'Model Number',         type: 'text'     },
    { id: 'serial_number',       label: 'Serial Number',        type: 'text'     },
    { id: 'kw_rating',           label: 'Output',               type: 'number',  unit: 'kW'  },
    { id: 'fuel_type',           label: 'Fuel Type',            type: 'select',  options: ['Propane', 'Natural Gas', 'Gasoline', 'Diesel'] },
    { id: 'transfer_switch_brand', label: 'Transfer Switch Brand', type: 'text' },
    { id: 'transfer_switch_amps', label: 'Transfer Switch Amps', type: 'number', unit: 'A'  },
    { id: 'oil_type',            label: 'Engine Oil Type',      type: 'text',    placeholder: 'e.g. 5W-30 Synthetic' },
    { id: 'oil_capacity_qt',     label: 'Oil Capacity',         type: 'number',  unit: 'qt' },
    { id: 'air_filter_part',     label: 'Air Filter Part #',    type: 'text'     },
    { id: 'last_service_date',   label: 'Last Service Date',    type: 'date'     },
    { id: 'notes',               label: 'Notes',                type: 'textarea' },
  ],
  hvac: [
    { id: 'unit_type',     label: 'Unit Type',        type: 'select', options: ['Furnace', 'Air Conditioner', 'Heat Pump', 'Air Handler', 'Mini-Split'] },
    { id: 'unit_label',    label: 'Zone / Label',     type: 'text', placeholder: 'e.g. Main Floor, Sunroom' },
    { id: 'brand',         label: 'Brand',            type: 'text'     },
    { id: 'model',         label: 'Model Number',     type: 'text'     },
    { id: 'serial_number', label: 'Serial Number',    type: 'text'     },
    { id: 'install_date',  label: 'Install Date',     type: 'date'     },
    { id: 'tonnage',       label: 'Cooling Tonnage',  type: 'number',  unit: 'tons' },
    { id: 'seer',          label: 'SEER Rating',      type: 'number'   },
    { id: 'refrigerant_type', label: 'Refrigerant',   type: 'select', options: ['R-410A', 'R-32', 'R-22', 'R-454B'] },
    { id: 'filter_size',   label: 'Filter Size',      type: 'text',    placeholder: 'e.g. 20×25×4' },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
  default: [
    { id: 'brand',         label: 'Brand',            type: 'text'     },
    { id: 'model',         label: 'Model Number',     type: 'text'     },
    { id: 'serial_number', label: 'Serial Number',    type: 'text'     },
    { id: 'install_date',  label: 'Install Date',     type: 'date'     },
    { id: 'notes',         label: 'Notes',            type: 'textarea' },
  ],
}

export function EquipmentFormScreen() {
  const { categoryId = 'generator' } = useParams()
  const navigate = useNavigate()

  const category = CATEGORIES.find(c => c.id === categoryId)
  const fields   = CATEGORY_FIELDS[categoryId] ?? CATEGORY_FIELDS.default

  const [aiState,  setAiState]  = useState<AIState>('idle')
  const [values,   setValues]   = useState<Record<string, string>>({})
  const [photos,   setPhotos]   = useState<string[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  function simulateExtraction() {
    setAiState('extracting')
    // Add a fake photo thumbnail
    setPhotos(prev => [...prev, 'nameplate'])
    setTimeout(() => {
      const extracted = MOCK_EXTRACTED[categoryId] ?? {}
      setValues(prev => ({ ...prev, ...extracted }))
      setAiState('done')
    }, 1800)
  }

  function handleSave() {
    setSaveState('saving')
    setTimeout(() => setSaveState('saved'), 1500)
  }

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
        <p className="text-xs text-slate-400 mb-6">
          {category?.icon} {values.brand || 'Equipment'} {values.model || ''} · {new Date().toLocaleDateString()}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/capture')}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            Capture another
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    )
  }

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
          <p className="text-xs text-slate-500">New equipment record</p>
        </div>
      </div>

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

          {/* Capture buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={simulateExtraction}
              disabled={aiState === 'extracting'}
              className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Camera
            </button>
            <button className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl px-4 py-3 transition-colors">
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>

          {/* AI Status */}
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
                  className="relative w-16 h-16 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center group"
                >
                  <ImageIcon className="w-6 h-6 text-slate-400" />
                  <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] text-slate-500 truncate px-0.5">{p}.jpg</span>
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-slate-700 text-white rounded-full items-center justify-center hidden group-hover:flex"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setPhotos(prev => [...prev, `photo_${prev.length + 1}`])}
                className="w-16 h-16 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
              >
                <span className="text-xl">+</span>
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
            const val      = values[field.id] ?? ''
            const aiFilledStyle = aiState === 'done' && val
              ? 'ring-2 ring-sky-200 border-sky-300'
              : ''

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
                    className={cn(
                      'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 resize-none transition-all placeholder:text-slate-400',
                      aiFilledStyle,
                    )}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={val}
                    onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className={cn(
                      'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 bg-white transition-all',
                      aiFilledStyle,
                    )}
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
                    className={cn(
                      'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition-all placeholder:text-slate-400',
                      aiFilledStyle,
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Save Button */}
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
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><Cloud className="w-4 h-4" /> Save to Drive</>
          )}
        </button>
      </div>

    </div>
  )
}
