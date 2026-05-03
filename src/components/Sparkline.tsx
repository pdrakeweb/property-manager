/**
 * Lightweight inline-SVG sparkline for HA entity history.
 *
 * Pure data → SVG path; no chart library dependency. Skips non-numeric
 * points and renders nothing when fewer than 2 numeric samples remain.
 */

import { useMemo } from 'react'
import type { HAHistoryPoint } from '../lib/haClient'

interface Props {
  points:   HAHistoryPoint[]
  width?:   number
  height?:  number
  /** Tailwind-compatible stroke color (defaults to emerald). */
  color?:   string
}

export function Sparkline({ points, width = 120, height = 32, color = '#10b981' }: Props) {
  const path = useMemo(() => buildPath(points, width, height), [points, width, height])

  if (!path) return null

  return (
    <svg
      role="img"
      aria-label={`24-hour history sparkline (${points.length} points)`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildPath(points: HAHistoryPoint[], width: number, height: number): string | null {
  // Coerce + filter to numeric samples only.
  const numeric: Array<{ t: number; v: number }> = []
  for (const p of points) {
    const v = Number(p.state)
    if (!Number.isFinite(v)) continue
    const t = Date.parse(p.last_changed)
    if (Number.isNaN(t)) continue
    numeric.push({ t, v })
  }
  if (numeric.length < 2) return null

  numeric.sort((a, b) => a.t - b.t)

  const tMin = numeric[0].t
  const tMax = numeric[numeric.length - 1].t
  const tSpan = tMax - tMin || 1

  let vMin = Infinity
  let vMax = -Infinity
  for (const p of numeric) {
    if (p.v < vMin) vMin = p.v
    if (p.v > vMax) vMax = p.v
  }
  // Avoid divide-by-zero on flat series — render a horizontal line at mid.
  const vSpan = vMax - vMin || 1

  // Pad 1px so the stroke isn't clipped at the top/bottom edges.
  const yPad = 2
  const ySpan = height - yPad * 2

  const segs: string[] = []
  for (let i = 0; i < numeric.length; i++) {
    const x = ((numeric[i].t - tMin) / tSpan) * width
    const y = yPad + (1 - (numeric[i].v - vMin) / vSpan) * ySpan
    segs.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return segs.join(' ')
}
