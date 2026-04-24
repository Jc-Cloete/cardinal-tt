import type { JsonValue } from 'cardinal-store'
import type { JsonRecord } from '../types'

// Lightweight runtime guards for parsed JSONL records.
export const asRecord = (value: JsonValue | undefined): JsonRecord | null =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : null

export const asObject = (value: JsonValue | null | undefined): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

export const asArray = (value: JsonValue | null | undefined): JsonValue[] =>
  Array.isArray(value) ? value : []

export const asString = (value: JsonValue | null | undefined): string | null =>
  typeof value === 'string' ? value : null

export const asNumber = (value: JsonValue | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const asBoolean = (value: JsonValue | null | undefined): boolean | null =>
  typeof value === 'boolean' ? value : null

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
