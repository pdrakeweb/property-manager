import { MapPin } from 'lucide-react'
import { BaseMap } from './BaseMap'
import { PropertyMarker } from './PropertyMarker'
import type { Property } from '../../types'

interface PropertyLocationCardProps {
  property: Property
}

export function PropertyLocationCard({ property }: PropertyLocationCardProps) {
  const hasCoords = property.latitude != null && property.longitude != null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
          Property Location
        </h2>
      </div>
      {hasCoords ? (
        <div className="h-48 lg:h-56">
          <BaseMap
            center={[property.latitude!, property.longitude!]}
            zoom={13}
            interactive={false}
          >
            <PropertyMarker property={property} isActive />
          </BaseMap>
        </div>
      ) : (
        <div className="h-48 lg:h-56 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 gap-2">
          <MapPin className="w-8 h-8" />
          <span className="text-sm font-medium">No location set</span>
          <span className="text-xs">Add coordinates to this property</span>
        </div>
      )}
    </div>
  )
}
