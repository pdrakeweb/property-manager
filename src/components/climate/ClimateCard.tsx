import { useState, useEffect } from 'react'
import { Thermometer, Droplets, Wind, Zap, Flame } from 'lucide-react'
import { cn } from '../../utils/cn'
import {
  fetchClimateAverages, fetchCurrentWeather,
  weatherCodeToDescription, weatherCodeToIcon,
} from '../../services/climateApi'
import { getEnergyRatesForAddress } from '../../data/energyRates'
import { getHeatingDemandLevel, getCoolingDemandLevel } from '../../data/climateZones'
import type { Property, ClimateData, CurrentWeather } from '../../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface ClimateCardProps {
  property: Property
}

export function ClimateCard({ property }: ClimateCardProps) {
  const [climate, setClimate] = useState<ClimateData | null>(null)
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasCoords = property.latitude != null && property.longitude != null

  useEffect(() => {
    if (!hasCoords) return
    setLoading(true)
    setError(null)

    Promise.all([
      fetchClimateAverages(property.latitude!, property.longitude!),
      fetchCurrentWeather(property.latitude!, property.longitude!),
    ])
      .then(([c, w]) => { setClimate(c); setWeather(w) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [property.id, property.latitude, property.longitude, hasCoords])

  const energyRates = property.address ? getEnergyRatesForAddress(property.address) : null

  if (!hasCoords) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Climate & Energy</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500">Add coordinates to view climate data</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Climate & Energy</h2>
          <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
            <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            Loading climate data...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Climate & Energy</h2>
          <p className="text-sm text-red-500">Failed to load climate data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="px-5 pt-5 pb-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Climate & Energy</h2>

        {/* Current Weather */}
        {weather && (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{weatherCodeToIcon(weather.weatherCode, weather.isDay)}</span>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{weather.temperature}°F</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">{weatherCodeToDescription(weather.weatherCode)}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Droplets className="w-3 h-3" />{weather.humidity}%
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Wind className="w-3 h-3" />{weather.windSpeed} mph
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Climate Zone Badge */}
        {climate && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              Zone {climate.climateZone}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{climate.climateZoneDescription}</span>
          </div>
        )}

        {/* HDD / CDD */}
        {climate && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{climate.annualHDD.toLocaleString()}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">HDD/yr</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
                <Thermometer className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{climate.annualCDD.toLocaleString()}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">CDD/yr</div>
              </div>
            </div>
          </div>
        )}

        {/* Temperature Mini Chart */}
        {climate && (
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Monthly avg temperature (°F)</div>
            <div className="flex items-end gap-px h-16">
              {climate.monthlyAvgHigh.map((high: number, i: number) => {
                const low = climate.monthlyAvgLow[i]
                const maxTemp = Math.max(...climate.monthlyAvgHigh)
                const minTemp = Math.min(...climate.monthlyAvgLow)
                const range = maxTemp - minTemp || 1
                const barBottom = ((low - minTemp) / range) * 100
                const barHeight = ((high - low) / range) * 100

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative" title={`${MONTHS[i]}: ${high}°/${low}°`}>
                    <div className="w-full relative" style={{ height: '48px' }}>
                      <div
                        className={cn(
                          'absolute bottom-0 w-full rounded-sm',
                          i === new Date().getMonth() ? 'bg-sky-500' : 'bg-sky-200 dark:bg-sky-800',
                        )}
                        style={{
                          bottom: `${barBottom}%`,
                          height: `${Math.max(barHeight, 4)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-none">{MONTHS[i][0]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Energy Rates */}
        {energyRates && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{energyRates.state} Energy Rates</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Electricity</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">{energyRates.electricityCentsPerKwh}¢/kWh</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Natural Gas</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">${energyRates.naturalGasDollarsPerTherm}/therm</div>
              </div>
            </div>
          </div>
        )}

        {/* Demand Assessment */}
        {climate && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400">
            {getHeatingDemandLevel(climate.annualHDD)} · {getCoolingDemandLevel(climate.annualCDD)}
          </div>
        )}
      </div>
    </div>
  )
}
