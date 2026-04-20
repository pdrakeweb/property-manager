import type { EnergyRates } from '../types'

// US state residential energy rates (2024 EIA data)
// Electricity: cents/kWh, Natural gas: $/therm
const STATE_ENERGY_RATES: Record<string, EnergyRates> = {
  AL: { state: 'Alabama', electricityCentsPerKwh: 14.46, naturalGasDollarsPerTherm: 1.58 },
  AK: { state: 'Alaska', electricityCentsPerKwh: 24.21, naturalGasDollarsPerTherm: 1.42 },
  AZ: { state: 'Arizona', electricityCentsPerKwh: 13.62, naturalGasDollarsPerTherm: 1.67 },
  AR: { state: 'Arkansas', electricityCentsPerKwh: 12.69, naturalGasDollarsPerTherm: 1.23 },
  CA: { state: 'California', electricityCentsPerKwh: 31.80, naturalGasDollarsPerTherm: 1.80 },
  CO: { state: 'Colorado', electricityCentsPerKwh: 15.26, naturalGasDollarsPerTherm: 1.09 },
  CT: { state: 'Connecticut', electricityCentsPerKwh: 29.74, naturalGasDollarsPerTherm: 1.76 },
  DE: { state: 'Delaware', electricityCentsPerKwh: 14.91, naturalGasDollarsPerTherm: 1.42 },
  FL: { state: 'Florida', electricityCentsPerKwh: 15.22, naturalGasDollarsPerTherm: 2.34 },
  GA: { state: 'Georgia', electricityCentsPerKwh: 14.12, naturalGasDollarsPerTherm: 1.49 },
  HI: { state: 'Hawaii', electricityCentsPerKwh: 43.18, naturalGasDollarsPerTherm: 5.33 },
  ID: { state: 'Idaho', electricityCentsPerKwh: 11.42, naturalGasDollarsPerTherm: 1.13 },
  IL: { state: 'Illinois', electricityCentsPerKwh: 16.39, naturalGasDollarsPerTherm: 1.12 },
  IN: { state: 'Indiana', electricityCentsPerKwh: 15.36, naturalGasDollarsPerTherm: 1.14 },
  IA: { state: 'Iowa', electricityCentsPerKwh: 15.21, naturalGasDollarsPerTherm: 1.12 },
  KS: { state: 'Kansas', electricityCentsPerKwh: 15.13, naturalGasDollarsPerTherm: 1.29 },
  KY: { state: 'Kentucky', electricityCentsPerKwh: 13.21, naturalGasDollarsPerTherm: 1.30 },
  LA: { state: 'Louisiana', electricityCentsPerKwh: 12.56, naturalGasDollarsPerTherm: 1.37 },
  ME: { state: 'Maine', electricityCentsPerKwh: 25.41, naturalGasDollarsPerTherm: 1.71 },
  MD: { state: 'Maryland', electricityCentsPerKwh: 16.17, naturalGasDollarsPerTherm: 1.34 },
  MA: { state: 'Massachusetts', electricityCentsPerKwh: 29.97, naturalGasDollarsPerTherm: 1.82 },
  MI: { state: 'Michigan', electricityCentsPerKwh: 19.34, naturalGasDollarsPerTherm: 1.10 },
  MN: { state: 'Minnesota', electricityCentsPerKwh: 15.42, naturalGasDollarsPerTherm: 1.08 },
  MS: { state: 'Mississippi', electricityCentsPerKwh: 13.54, naturalGasDollarsPerTherm: 1.41 },
  MO: { state: 'Missouri', electricityCentsPerKwh: 13.54, naturalGasDollarsPerTherm: 1.28 },
  MT: { state: 'Montana', electricityCentsPerKwh: 13.02, naturalGasDollarsPerTherm: 0.98 },
  NE: { state: 'Nebraska', electricityCentsPerKwh: 12.72, naturalGasDollarsPerTherm: 1.12 },
  NV: { state: 'Nevada', electricityCentsPerKwh: 14.74, naturalGasDollarsPerTherm: 1.42 },
  NH: { state: 'New Hampshire', electricityCentsPerKwh: 26.29, naturalGasDollarsPerTherm: 1.76 },
  NJ: { state: 'New Jersey', electricityCentsPerKwh: 18.72, naturalGasDollarsPerTherm: 1.21 },
  NM: { state: 'New Mexico', electricityCentsPerKwh: 15.16, naturalGasDollarsPerTherm: 0.98 },
  NY: { state: 'New York', electricityCentsPerKwh: 23.39, naturalGasDollarsPerTherm: 1.43 },
  NC: { state: 'North Carolina', electricityCentsPerKwh: 13.25, naturalGasDollarsPerTherm: 1.37 },
  ND: { state: 'North Dakota', electricityCentsPerKwh: 12.61, naturalGasDollarsPerTherm: 0.95 },
  OH: { state: 'Ohio', electricityCentsPerKwh: 15.07, naturalGasDollarsPerTherm: 1.18 },
  OK: { state: 'Oklahoma', electricityCentsPerKwh: 12.67, naturalGasDollarsPerTherm: 1.17 },
  OR: { state: 'Oregon', electricityCentsPerKwh: 13.34, naturalGasDollarsPerTherm: 1.37 },
  PA: { state: 'Pennsylvania', electricityCentsPerKwh: 17.98, naturalGasDollarsPerTherm: 1.28 },
  RI: { state: 'Rhode Island', electricityCentsPerKwh: 27.58, naturalGasDollarsPerTherm: 1.71 },
  SC: { state: 'South Carolina', electricityCentsPerKwh: 14.38, naturalGasDollarsPerTherm: 1.54 },
  SD: { state: 'South Dakota', electricityCentsPerKwh: 13.95, naturalGasDollarsPerTherm: 1.07 },
  TN: { state: 'Tennessee', electricityCentsPerKwh: 13.08, naturalGasDollarsPerTherm: 1.23 },
  TX: { state: 'Texas', electricityCentsPerKwh: 14.52, naturalGasDollarsPerTherm: 1.28 },
  UT: { state: 'Utah', electricityCentsPerKwh: 12.11, naturalGasDollarsPerTherm: 1.05 },
  VT: { state: 'Vermont', electricityCentsPerKwh: 22.37, naturalGasDollarsPerTherm: 1.97 },
  VA: { state: 'Virginia', electricityCentsPerKwh: 14.41, naturalGasDollarsPerTherm: 1.42 },
  WA: { state: 'Washington', electricityCentsPerKwh: 12.05, naturalGasDollarsPerTherm: 1.37 },
  WV: { state: 'West Virginia', electricityCentsPerKwh: 13.85, naturalGasDollarsPerTherm: 1.27 },
  WI: { state: 'Wisconsin', electricityCentsPerKwh: 17.18, naturalGasDollarsPerTherm: 1.06 },
  WY: { state: 'Wyoming', electricityCentsPerKwh: 12.32, naturalGasDollarsPerTherm: 0.97 },
  DC: { state: 'District of Columbia', electricityCentsPerKwh: 15.78, naturalGasDollarsPerTherm: 1.41 },
}

export function getEnergyRates(stateAbbr: string): EnergyRates | null {
  return STATE_ENERGY_RATES[stateAbbr.toUpperCase()] ?? null
}

// Simple state lookup from address string
export function extractStateAbbr(address: string): string | null {
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/) ?? address.match(/,\s*([A-Z]{2})\s*$/)
  return match?.[1] ?? null
}

export function getEnergyRatesForAddress(address: string): EnergyRates | null {
  const state = extractStateAbbr(address)
  return state ? getEnergyRates(state) : null
}
