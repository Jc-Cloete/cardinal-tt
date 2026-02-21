import {DAY_MS} from '../constants'
import type {DateParts, DayBounds} from '../types'

export const toSorted = (arr: string[]): string[] =>
  [...arr].sort((a, b) => a.localeCompare(b))

export const normalizeNumericDatePart = (value: string): string => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return String(parsed)
}

export const pickDateOption = (options: string[], preferred: string): string => {
  if (options.includes(preferred)) {
    return preferred
  }

  const normalizedPreferred = normalizeNumericDatePart(preferred)
  const fallback = options.find((option) => normalizeNumericDatePart(option) === normalizedPreferred)
  return fallback || ''
}

export const getTodayParts = (): DateParts => {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return {year, month, day}
}

export const getDayBounds = (year: string, month: string, day: string): DayBounds | null => {
  if (!year || !month || !day) {
    return null
  }

  const start = new Date(`${year}-${month}-${day}T00:00:00`)
  if (Number.isNaN(start.getTime())) {
    return null
  }

  return {
    startMs: start.getTime(),
    endMs: start.getTime() + DAY_MS,
    totalMs: DAY_MS,
  }
}

export const parseTimeMs = (value: string | undefined, fallbackMs: number = Date.now()): number => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : fallbackMs
}

export const formatDuration = (durationMs: number): string => {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}

export const formatTime = (value: number, includeDate: boolean = false): string => {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) {
    return '--:--'
  }

  if (includeDate) {
    return dt.toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return dt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}
