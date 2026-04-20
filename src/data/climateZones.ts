// IECC/ASHRAE Climate Zone lookup
// Simplified by US state + latitude band for residential purposes

interface ClimateZoneInfo {
  zone: string
  description: string
}

const STATE_ZONES: Record<string, ClimateZoneInfo> = {
  AL: { zone: '3A', description: 'Warm-Humid' },
  AK: { zone: '7', description: 'Very Cold' },
  AZ: { zone: '2B', description: 'Hot-Dry' },
  AR: { zone: '3A', description: 'Warm-Humid' },
  CA: { zone: '3B', description: 'Warm-Dry' },
  CO: { zone: '5B', description: 'Cold-Dry' },
  CT: { zone: '5A', description: 'Cold-Humid' },
  DE: { zone: '4A', description: 'Mixed-Humid' },
  FL: { zone: '2A', description: 'Hot-Humid' },
  GA: { zone: '3A', description: 'Warm-Humid' },
  HI: { zone: '1A', description: 'Very Hot-Humid' },
  ID: { zone: '5B', description: 'Cold-Dry' },
  IL: { zone: '5A', description: 'Cold-Humid' },
  IN: { zone: '5A', description: 'Cold-Humid' },
  IA: { zone: '5A', description: 'Cold-Humid' },
  KS: { zone: '4A', description: 'Mixed-Humid' },
  KY: { zone: '4A', description: 'Mixed-Humid' },
  LA: { zone: '2A', description: 'Hot-Humid' },
  ME: { zone: '6A', description: 'Cold-Humid' },
  MD: { zone: '4A', description: 'Mixed-Humid' },
  MA: { zone: '5A', description: 'Cold-Humid' },
  MI: { zone: '5A', description: 'Cold-Humid' },
  MN: { zone: '6A', description: 'Cold-Humid' },
  MS: { zone: '3A', description: 'Warm-Humid' },
  MO: { zone: '4A', description: 'Mixed-Humid' },
  MT: { zone: '6B', description: 'Cold-Dry' },
  NE: { zone: '5A', description: 'Cold-Humid' },
  NV: { zone: '3B', description: 'Warm-Dry' },
  NH: { zone: '6A', description: 'Cold-Humid' },
  NJ: { zone: '4A', description: 'Mixed-Humid' },
  NM: { zone: '4B', description: 'Mixed-Dry' },
  NY: { zone: '5A', description: 'Cold-Humid' },
  NC: { zone: '4A', description: 'Mixed-Humid' },
  ND: { zone: '6A', description: 'Cold-Humid' },
  OH: { zone: '5A', description: 'Cold-Humid' },
  OK: { zone: '3A', description: 'Warm-Humid' },
  OR: { zone: '4C', description: 'Mixed-Marine' },
  PA: { zone: '5A', description: 'Cold-Humid' },
  RI: { zone: '5A', description: 'Cold-Humid' },
  SC: { zone: '3A', description: 'Warm-Humid' },
  SD: { zone: '6A', description: 'Cold-Humid' },
  TN: { zone: '4A', description: 'Mixed-Humid' },
  TX: { zone: '2A', description: 'Hot-Humid' },
  UT: { zone: '5B', description: 'Cold-Dry' },
  VT: { zone: '6A', description: 'Cold-Humid' },
  VA: { zone: '4A', description: 'Mixed-Humid' },
  WA: { zone: '4C', description: 'Mixed-Marine' },
  WV: { zone: '5A', description: 'Cold-Humid' },
  WI: { zone: '6A', description: 'Cold-Humid' },
  WY: { zone: '6B', description: 'Cold-Dry' },
  DC: { zone: '4A', description: 'Mixed-Humid' },
}

export function getClimateZone(lat: number, _lng: number): ClimateZoneInfo {
  // Latitude-band heuristic for continental US
  if (lat > 46) return { zone: '6A', description: 'Cold-Humid' }
  if (lat > 42) return { zone: '5A', description: 'Cold-Humid' }
  if (lat > 37) return { zone: '4A', description: 'Mixed-Humid' }
  if (lat > 31) return { zone: '3A', description: 'Warm-Humid' }
  return { zone: '2A', description: 'Hot-Humid' }
}

export function getClimateZoneByState(stateAbbr: string): ClimateZoneInfo | null {
  return STATE_ZONES[stateAbbr.toUpperCase()] ?? null
}

export function getHeatingDemandLevel(hdd: number): string {
  if (hdd > 7000) return 'Very high heating demand'
  if (hdd > 5500) return 'High heating demand'
  if (hdd > 4000) return 'Moderate heating demand'
  if (hdd > 2000) return 'Low heating demand'
  return 'Minimal heating demand'
}

export function getCoolingDemandLevel(cdd: number): string {
  if (cdd > 3000) return 'Very high cooling demand'
  if (cdd > 2000) return 'High cooling demand'
  if (cdd > 1000) return 'Moderate cooling demand'
  if (cdd > 500) return 'Low cooling demand'
  return 'Minimal cooling demand'
}
