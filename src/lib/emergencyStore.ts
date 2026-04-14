import type { EmergencyCard } from '../schemas'

export function getEmergencyCard(propertyId: string): EmergencyCard | null {
  try {
    const raw = localStorage.getItem(`pm_emergency_${propertyId}`)
    return raw ? JSON.parse(raw) as EmergencyCard : null
  } catch { return null }
}

export function saveEmergencyCard(card: EmergencyCard): void {
  localStorage.setItem(`pm_emergency_${card.propertyId}`, JSON.stringify(card))
}
