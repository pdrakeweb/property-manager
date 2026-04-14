import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../utils/cn'
import { MAINTENANCE_TASKS } from '../data/mockData'
import { costStore } from '../lib/costStore'
import { getAllCustomTasks } from '../lib/maintenanceStore'

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface MiniCalendarProps {
  propertyId: string
}

export function MiniCalendar({ propertyId }: MiniCalendarProps) {
  const navigate  = useNavigate()
  const todayDate = new Date()
  const today     = todayDate.toISOString().slice(0, 10)

  const [year,  setYear]  = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth())

  const customTasks  = getAllCustomTasks()
  const allTasks     = [...MAINTENANCE_TASKS, ...customTasks].filter(t => t.propertyId === propertyId)
  const completedAll = costStore.getAll().filter(e => e.propertyId === propertyId)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const firstDay     = firstDayOfMonth(year, month)
  const daysInMo     = daysInMonth(year, month)
  const prevDaysInMo = daysInMonth(year, month === 0 ? 11 : month - 1)
  const totalCells   = Math.ceil((firstDay + daysInMo) / 7) * 7

  type MiniDay = { dateStr: string; day: number; thisMonth: boolean }
  const cells: MiniDay[] = []
  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      const prevY = month === 0 ? year - 1 : year
      const prevM = month === 0 ? 11 : month - 1
      cells.push({ dateStr: isoDate(prevY, prevM, prevDaysInMo - (firstDay - i - 1)), day: prevDaysInMo - (firstDay - i - 1), thisMonth: false })
    } else {
      const d = i - firstDay + 1
      if (d <= daysInMo) {
        cells.push({ dateStr: isoDate(year, month, d), day: d, thisMonth: true })
      } else {
        const nextY = month === 11 ? year + 1 : year
        const nextM = month === 11 ? 0 : month + 1
        cells.push({ dateStr: isoDate(nextY, nextM, d - daysInMo), day: d - daysInMo, thisMonth: false })
      }
    }
  }

  function getDotColor(dateStr: string): string | null {
    const tasks = allTasks.filter(t => t.dueDate === dateStr)
    const done  = completedAll.some(e => e.completionDate === dateStr)
    if (done && tasks.length === 0) return 'bg-emerald-500'
    if (tasks.some(t => t.status === 'overdue' || t.dueDate < today)) return 'bg-red-500'
    const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    if (tasks.some(t => t.dueDate <= week)) return 'bg-amber-400'
    if (tasks.length > 0) return 'bg-sky-500'
    if (done) return 'bg-emerald-500'
    return null
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric',
  })

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
        <div className="flex gap-0.5">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, idx) => {
          const isToday  = cell.dateStr === today
          const dotColor = cell.thisMonth ? getDotColor(cell.dateStr) : null

          return (
            <button
              key={idx}
              onClick={() => navigate('/calendar')}
              disabled={!cell.thisMonth}
              className={cn(
                'flex flex-col items-center py-0.5 rounded-lg transition-colors',
                cell.thisMonth ? 'hover:bg-sky-50 cursor-pointer' : 'opacity-20 cursor-default pointer-events-none',
              )}
            >
              <span className={cn(
                'w-6 h-6 flex items-center justify-center text-[11px] rounded-full font-medium',
                isToday ? 'bg-sky-600 text-white font-bold' : 'text-slate-600',
              )}>
                {cell.day}
              </span>
              <span className="h-1.5 flex items-center justify-center">
                {dotColor && (
                  <span className={cn('w-1 h-1 rounded-full', dotColor)} />
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Link to full calendar */}
      <button
        onClick={() => navigate('/calendar')}
        className="mt-2 w-full text-center text-xs text-sky-600 hover:text-sky-800 font-medium py-1.5 hover:bg-sky-50 rounded-lg transition-colors"
      >
        Open full calendar →
      </button>
    </div>
  )
}
