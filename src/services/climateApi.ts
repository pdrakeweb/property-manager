import type { ClimateData, CurrentWeather } from '../types'
import { getClimateZone } from '../data/climateZones'

const CLIMATE_CACHE_KEY = 'pm_climate_'
const WEATHER_CACHE_KEY = 'pm_weather_'
const CLIMATE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const WEATHER_TTL_MS = 60 * 60 * 1000 // 1 hour

function cacheKey(prefix: string, lat: number, lng: number) {
  return `${prefix}${lat.toFixed(2)}_${lng.toFixed(2)}`
}

function getCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as T & { fetchedAt: string }
    if (Date.now() - new Date(data.fetchedAt).getTime() > ttl) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function setCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage full — ignore
  }
}

export async function fetchClimateAverages(lat: number, lng: number): Promise<ClimateData> {
  const key = cacheKey(CLIMATE_CACHE_KEY, lat, lng)
  const cached = getCache<ClimateData>(key, CLIMATE_TTL_MS)
  if (cached) return cached

  // Fetch 30-year monthly averages from Open-Meteo climate API
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    start_date: '1991-01-01',
    end_date: '2020-12-31',
    models: 'EC_Earth3P_HR',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch',
    timezone: 'America/New_York',
  })

  const resp = await fetch(`https://climate-api.open-meteo.com/v1/climate?${params}`)
  if (!resp.ok) throw new Error(`Climate API error: ${resp.status}`)

  const json = await resp.json()
  const highs: number[] = json.daily.temperature_2m_max
  const lows: number[] = json.daily.temperature_2m_min
  const precip: number[] = json.daily.precipitation_sum

  // Compute monthly averages
  const monthlyAvgHigh: number[] = []
  const monthlyAvgLow: number[] = []
  const monthlyPrecipitation: number[] = []
  const dates: string[] = json.daily.time

  for (let m = 0; m < 12; m++) {
    let sumH = 0, sumL = 0, sumP = 0, count = 0
    for (let i = 0; i < dates.length; i++) {
      const month = new Date(dates[i]).getMonth()
      if (month === m && highs[i] != null && lows[i] != null) {
        sumH += highs[i]
        sumL += lows[i]
        sumP += precip[i] ?? 0
        count++
      }
    }
    monthlyAvgHigh.push(count ? Math.round(sumH / count) : 0)
    monthlyAvgLow.push(count ? Math.round(sumL / count) : 0)
    // Monthly total precipitation averaged across years
    const years = 30
    monthlyPrecipitation.push(count ? Math.round((sumP / years) * 10) / 10 : 0)
  }

  // Compute annual HDD and CDD (base 65F)
  let annualHDD = 0
  let annualCDD = 0
  for (let i = 0; i < dates.length; i++) {
    if (highs[i] == null || lows[i] == null) continue
    const avgTemp = (highs[i] + lows[i]) / 2
    if (avgTemp < 65) annualHDD += 65 - avgTemp
    if (avgTemp > 65) annualCDD += avgTemp - 65
  }
  // Average across the 30-year period
  annualHDD = Math.round(annualHDD / 30)
  annualCDD = Math.round(annualCDD / 30)

  const zone = getClimateZone(lat, lng)

  const data: ClimateData = {
    climateZone: zone.zone,
    climateZoneDescription: zone.description,
    monthlyAvgHigh,
    monthlyAvgLow,
    monthlyPrecipitation,
    annualHDD,
    annualCDD,
    fetchedAt: new Date().toISOString(),
  }

  setCache(key, data)
  return data
}

export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const key = cacheKey(WEATHER_CACHE_KEY, lat, lng)
  const cached = getCache<CurrentWeather>(key, WEATHER_TTL_MS)
  if (cached) return cached

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'America/New_York',
  })

  const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!resp.ok) throw new Error(`Weather API error: ${resp.status}`)

  const json = await resp.json()
  const c = json.current

  const data: CurrentWeather = {
    temperature: Math.round(c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m),
    weatherCode: c.weather_code,
    windSpeed: Math.round(c.wind_speed_10m),
    isDay: c.is_day === 1,
    fetchedAt: new Date().toISOString(),
  }

  setCache(key, data)
  return data
}

// WMO Weather Code descriptions
export function weatherCodeToDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  }
  return descriptions[code] ?? 'Unknown'
}

export function weatherCodeToIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? '\u2600\uFE0F' : '\uD83C\uDF19'
  if (code <= 2) return isDay ? '\u26C5' : '\u2601\uFE0F'
  if (code === 3) return '\u2601\uFE0F'
  if (code <= 48) return '\uD83C\uDF2B\uFE0F'
  if (code <= 55) return '\uD83C\uDF26\uFE0F'
  if (code <= 65) return '\uD83C\uDF27\uFE0F'
  if (code <= 77) return '\u2744\uFE0F'
  if (code <= 82) return '\uD83C\uDF27\uFE0F'
  if (code <= 86) return '\uD83C\uDF28\uFE0F'
  return '\u26C8\uFE0F'
}
