import { useState, useEffect, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  Thermometer, Droplets, Wind, Zap, Flame, MapPin,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { BaseMap } from '../components/map/BaseMap'
import { PropertyMarker } from '../components/map/PropertyMarker'
import { useAppStore } from '../store/AppStoreContext'

import {
  fetchClimateAverages, fetchCurrentWeather,
  weatherCodeToDescription, weatherCodeToIcon,
} from '../services/climateApi'
import { getEnergyRatesForAddress } from '../data/energyRates'
import { getHeatingDemandLevel, getCoolingDemandLevel } from '../data/climateZones'
import type { ClimateData, CurrentWeather, GeolocatedProperty } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function FitBounds({ properties }: { properties: GeolocatedProperty[] }) {
  const map = useMap()

  useEffect(() => {
    if (properties.length === 0) return
    if (properties.length === 1) {
      map.setView([properties[0].latitude, properties[0].longitude], 13)
      return
    }
    const bounds = L.latLngBounds(properties.map(p => [p.latitude, p.longitude]))
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [map, properties])

  return null
}

export function MapScreen() {
  const { activePropertyId, setActivePropertyId, properties } = useAppStore()
  const activeProperty = properties.find(p => p.id === activePropertyId) ?? properties[0]
  const [climate, setClimate] = useState<ClimateData | null>(null)
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [loading, setLoading] = useState(false)

  const geoProperties = useMemo(
    () => properties.filter((p): p is GeolocatedProperty => p.latitude != null && p.longitude != null),
    [properties],
  )

  const hasCoords = activeProperty.latitude != null && activeProperty.longitude != null
  const energyRates = activeProperty.address ? getEnergyRatesForAddress(activeProperty.address) : null

  useEffect(() => {
    if (!hasCoords) { setClimate(null); setWeather(null); return }
    setLoading(true)
    Promise.all([
      fetchClimateAverages(activeProperty.latitude!, activeProperty.longitude!),
      fetchCurrentWeather(activeProperty.latitude!, activeProperty.longitude!),
    ])
      .then(([c, w]) => { setClimate(c); setWeather(w) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeProperty.id, activeProperty.latitude, activeProperty.longitude, hasCoords])

  const defaultCenter: [number, number] = geoProperties.length > 0
    ? [geoProperties[0].latitude, geoProperties[0].longitude]
    : [39.8283, -98.5795] // Center of US

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Properties Map</h1>

      {/* Map */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {geoProperties.length > 0 ? (
          <div className="h-[50vh] lg:h-[55vh]">
            <BaseMap center={defaultCenter} zoom={13}>
              <FitBounds properties={geoProperties} />
              {geoProperties.map(p => (
                <PropertyMarker
                  key={p.id}
                  property={p}
                  isActive={p.id === activePropertyId}
                  onSelect={setActivePropertyId}
                />
              ))}
            </BaseMap>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
            <MapPin className="w-10 h-10" />
            <span className="text-sm font-medium">No properties with coordinates</span>
            <span className="text-xs">Add latitude and longitude to your properties</span>
          </div>
        )}
      </div>

      {/* Climate & Energy Panel */}
      {hasCoords && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="px-5 pt-5 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Climate & Energy — {activeProperty.shortName}
              </h2>
              {climate && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  Zone {climate.climateZone}
                </span>
              )}
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                Loading climate data...
              </div>
            )}

            {!loading && weather && climate && (
              <>
                {/* Current + Zone row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Current Weather */}
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{weatherCodeToIcon(weather.weatherCode, weather.isDay)}</span>
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{weather.temperature}°F</span>
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{weatherCodeToDescription(weather.weatherCode)}</div>
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

                  {/* HDD / CDD */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-orange-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {climate.annualHDD.toLocaleString()} HDD/yr
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{getHeatingDemandLevel(climate.annualHDD)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
                        <Thermometer className="w-4 h-4 text-sky-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {climate.annualCDD.toLocaleString()} CDD/yr
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{getCoolingDemandLevel(climate.annualCDD)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Temperature Chart */}
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Monthly Average Temperature (°F)</div>
                  <div className="flex items-end gap-1 h-24">
                    {climate.monthlyAvgHigh.map((high: number, i: number) => {
                      const low = climate.monthlyAvgLow[i]
                      const maxTemp = Math.max(...climate.monthlyAvgHigh)
                      const minTemp = Math.min(...climate.monthlyAvgLow)
                      const range = maxTemp - minTemp || 1
                      const barBottom = ((low - minTemp) / range) * 100
                      const barHeight = ((high - low) / range) * 100
                      const isCurrent = i === new Date().getMonth()

                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${MONTHS[i]}: ${high}°/${low}°`}>
                          <span className={cn('text-[10px] tabular-nums leading-none', isCurrent ? 'font-bold text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500')}>
                            {high}°
                          </span>
                          <div className="w-full relative" style={{ height: '56px' }}>
                            <div
                              className={cn(
                                'absolute w-full rounded-sm transition-all',
                                isCurrent ? 'bg-sky-500' : 'bg-sky-200 dark:bg-sky-800',
                              )}
                              style={{
                                bottom: `${barBottom}%`,
                                height: `${Math.max(barHeight, 4)}%`,
                              }}
                            />
                          </div>
                          <span className={cn('text-[10px] leading-none', isCurrent ? 'font-bold text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500')}>
                            {MONTHS[i]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Monthly Precipitation */}
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Monthly Precipitation (inches)</div>
                  <div className="flex items-end gap-1 h-16">
                    {climate.monthlyPrecipitation.map((precip: number, i: number) => {
                      const maxPrecip = Math.max(...climate.monthlyPrecipitation)
                      const barHeight = maxPrecip ? (precip / maxPrecip) * 100 : 0
                      const isCurrent = i === new Date().getMonth()

                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${MONTHS[i]}: ${precip}"`}>
                          <div className="w-full flex items-end" style={{ height: '40px' }}>
                            <div
                              className={cn(
                                'w-full rounded-sm',
                                isCurrent ? 'bg-sky-500' : 'bg-sky-100 dark:bg-sky-900/40',
                              )}
                              style={{ height: `${Math.max(barHeight, 4)}%` }}
                            />
                          </div>
                          <span className={cn('text-[9px] tabular-nums leading-none', isCurrent ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500')}>
                            {precip}"
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Energy Rates */}
                {energyRates && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                        {energyRates.state} Residential Energy Rates
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Electricity</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{energyRates.electricityCentsPerKwh}¢<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/kWh</span></div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Natural Gas</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">${energyRates.naturalGasDollarsPerTherm}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/therm</span></div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Climate Zone</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{climate.climateZone}</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Zone Type</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{climate.climateZoneDescription}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Climate Tips */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                    Climate Considerations
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    {climate.annualHDD > 5000 && (
                      <li>- High heating needs — ensure furnace is maintained and insulation is adequate</li>
                    )}
                    {climate.annualHDD > 5000 && (
                      <li>- Freeze risk: protect exposed pipes, maintain heat tape on vulnerable lines</li>
                    )}
                    {climate.annualCDD > 800 && (
                      <li>- Summer cooling load present — A/C maintenance before June is recommended</li>
                    )}
                    {Math.max(...climate.monthlyPrecipitation) > 4 && (
                      <li>- Heavy precipitation months: check sump pump, gutters, and drainage</li>
                    )}
                    {climate.climateZone.startsWith('5') && (
                      <li>- Zone 5: R-49 attic insulation, R-20 wall insulation recommended per IECC</li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
