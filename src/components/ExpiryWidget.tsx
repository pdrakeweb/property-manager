import { useNavigate } from 'react-router-dom'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '../utils/cn'
import { getUpcomingExpiries } from '../lib/expiryStore'

const EXPIRY_TYPE_LABELS: Record<string, string> = {
  warranty:  'Warranty',
  insurance: 'Insurance',
  permit:    'Permit',
  contract:  'Contract',
  other:     'Other',
}

interface ExpiryWidgetProps {
  propertyId: string
}

export function ExpiryWidget({ propertyId }: ExpiryWidgetProps) {
  const navigate = useNavigate()
  const all = getUpcomingExpiries(propertyId, 180)
  const shown = all.slice(0, 5)
  const extra = all.length - 5

  if (all.length === 0) {
    return null
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Documents Expiring Soon</h2>
          <button
            onClick={() => navigate('/expiry')}
            className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-0.5"
          >
            Manage <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2.5">
          {shown.map(d => {
            const days = Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86400000)
            const colorClass =
              days < 0   ? 'text-red-600 bg-red-50 border-red-200' :
              days < 30  ? 'text-red-600 bg-red-50 border-red-200' :
              days < 90  ? 'text-amber-600 bg-amber-50 border-amber-200' :
              'text-emerald-600 bg-emerald-50 border-emerald-200'
            const daysLabel = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`

            return (
              <div key={d.id} className="flex items-center gap-3">
                {days < 30 && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{d.filename}</p>
                </div>
                <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-md px-2 py-0.5 shrink-0">
                  {EXPIRY_TYPE_LABELS[d.expiryType] ?? d.expiryType}
                </span>
                <span className={cn('text-xs font-semibold border rounded-full px-2 py-0.5 shrink-0', colorClass)}>
                  {daysLabel}
                </span>
              </div>
            )
          })}
        </div>

        {extra > 0 && (
          <button
            onClick={() => navigate('/expiry')}
            className="mt-3 text-xs text-sky-600 hover:text-sky-700 font-medium"
          >
            + {extra} more
          </button>
        )}
      </div>
    </div>
  )
}
