import { Marker, Popup } from 'react-leaflet'
import { Building2, TreePine } from 'lucide-react'
import { brandMarkerIcon } from './BaseMap'
import type { Property } from '../../types'

const PROPERTY_ICONS = { residence: Building2, camp: TreePine, land: Building2 } as const

interface PropertyMarkerProps {
  property: Property
  onSelect?: (id: string) => void
  isActive?: boolean
}

export function PropertyMarker({ property, onSelect, isActive }: PropertyMarkerProps) {
  if (property.latitude == null || property.longitude == null) return null

  const Icon = PROPERTY_ICONS[property.type]

  return (
    <Marker position={[property.latitude, property.longitude]} icon={brandMarkerIcon}>
      <Popup>
        <div className="min-w-[180px]">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-sm font-semibold text-slate-900">{property.name}</span>
          </div>
          {property.address && (
            <p className="text-xs text-slate-500 mb-1">{property.address}</p>
          )}
          <p className="text-xs text-slate-500 mb-2">
            {property.stats.documented}/{property.stats.total} documented
          </p>
          {onSelect && !isActive && (
            <button
              onClick={() => onSelect(property.id)}
              className="w-full text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-1.5 transition-colors"
            >
              Switch to this property
            </button>
          )}
          {isActive && (
            <span className="block text-center text-xs font-medium text-emerald-600">
              Active property
            </span>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
