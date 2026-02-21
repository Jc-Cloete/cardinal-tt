import type {JsonRecord} from '../types'

export const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : null

export const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

export const parseJsonRecord = (line: string): JsonRecord | null => {
  try {
    return asRecord(JSON.parse(line) as unknown)
  } catch {
    return null
  }
}

export const parseTimestampMs = (value: string | undefined | null): number | null => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}
