import type { JsonValue } from 'cardinal-store'
import type { JsonRecord } from '../types'

// Lightweight runtime guards for parsed JSONL records.
export const asRecord = (value: JsonValue | undefined): JsonRecord | null =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : null

export const asString = (value: JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null

export const parseJsonRecord = (line: string): JsonRecord | null => {
  try {
    return asRecord(JSON.parse(line) as JsonValue)
  } catch {
    return null
  }
}

export const parseTimestampMs = (value: string | undefined | null): number | null => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}
