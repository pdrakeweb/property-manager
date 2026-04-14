// Season → canonical date mapping and recurrence expansion.

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

const SEASON_MONTH_DAY: Record<Season, [number, number]> = {
  spring: [3,  1],   // April 1   (month is 0-indexed)
  summer: [5, 21],   // June 21
  fall:   [8, 22],   // September 22
  winter: [11, 1],   // December 1
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the next occurrence of a season.
 * If `year` is provided, uses that year unconditionally.
 * Otherwise: uses the current year if the season date hasn't passed, else next year.
 */
export function seasonToDate(season: Season, year?: number): string {
  const [month, day] = SEASON_MONTH_DAY[season]
  const now = new Date()

  if (year !== undefined) {
    return fmt(year, month, day)
  }

  const thisYear = now.getFullYear()
  const candidate = new Date(thisYear, month, day)

  // If the season date is still in the future (or today), use this year
  if (candidate >= now) return fmt(thisYear, month, day)
  // Otherwise use next year
  return fmt(thisYear + 1, month, day)
}

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Given a task's dueDate and recurrence string, return ISO date strings
 * for the next N months of upcoming occurrences (starting from today).
 *
 * Recognized recurrence values: Annually, Semi-annual, Quarterly, Monthly, Weekly.
 * Returns at most 12 dates. Returns [] for unrecognized or empty recurrence.
 */
export function expandRecurring(
  baseDate:   string,
  recurrence: string,
  months:     number = 12,
): string[] {
  if (!recurrence) return []

  const rec   = recurrence.toLowerCase()
  const today = new Date()
  const cutoff = new Date(today.getFullYear(), today.getMonth() + months, today.getDate())

  let intervalDays: number
  if      (rec.includes('annual') || rec.includes('yearly'))   intervalDays = 365
  else if (rec.includes('semi'))                                intervalDays = 182
  else if (rec.includes('quarterly') || rec.includes('90'))    intervalDays = 91
  else if (rec.includes('monthly'))                            intervalDays = 30
  else if (rec.includes('weekly'))                             intervalDays = 7
  else return []

  const results: string[] = []
  let current = new Date(baseDate + 'T12:00:00')

  // Advance past today if base date is already in the past
  while (current < today) {
    current = new Date(current.getTime() + intervalDays * 86_400_000)
  }

  while (current <= cutoff && results.length < 12) {
    results.push(current.toISOString().slice(0, 10))
    current = new Date(current.getTime() + intervalDays * 86_400_000)
  }

  return results
}
