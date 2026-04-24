import { describe, expect, it } from 'bun:test'
import {
  formatDuration,
  formatTime,
  getDayBounds,
  normalizeNumericDatePart,
  parseTimeMs,
  pickDateOption,
  toSorted,
} from '../utils/date'

describe('client date utils', () => {
  // @spec SPEC-CLIENT-DATE
  it('sorts date-like values and normalizes numeric strings', () => {
    expect(toSorted(['10', '2', '1'])).toEqual(['1', '10', '2'])
    expect(normalizeNumericDatePart('02')).toBe('2')
    expect(normalizeNumericDatePart('abc')).toBe('abc')
  })

  it('picks preferred options using exact or normalized values', () => {
    expect(pickDateOption(['02', '03'], '03')).toBe('03')
    expect(pickDateOption(['02', '03'], '2')).toBe('02')
    expect(pickDateOption(['02', '03'], '12')).toBe('')
  })

  it('returns day bounds for valid date inputs and null for invalid values', () => {
    const bounds = getDayBounds('2026', '02', '20')
    expect(bounds).not.toBeNull()
    expect((bounds?.endMs || 0) - (bounds?.startMs || 0)).toBe(24 * 60 * 60 * 1000)
    expect(getDayBounds('', '02', '20')).toBeNull()
  })

  it('parses time values with fallback and formats duration/time labels', () => {
    const fallback = 12345
    expect(parseTimeMs('not-a-time', fallback)).toBe(fallback)
    expect(parseTimeMs('2026-02-20T10:00:00.000Z')).toBeGreaterThan(fallback)
    expect(formatDuration(3_660_000)).toBe('01h 01m')
    expect(formatTime(Number.NaN)).toBe('--:--')
  })
})
