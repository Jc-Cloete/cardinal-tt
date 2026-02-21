import { UNKNOWN_PROJECT } from '../config'
import type {
  ParsedSessionContent,
  ProcessedSession,
  SessionSegment,
  SessionSummary,
} from '../types'
import { asString, parseJsonRecord, parseTimestampMs } from '../utils/json'
import { readProjectDirFromSessionMeta, shouldExcludePreviewEntry } from './filters'

// Parse a raw JSONL session file once and derive the data needed by list + preview views.
export const parseSessionFileContent = (content: string): ParsedSessionContent => {
  let projectDir = UNKNOWN_PROJECT
  const timestampsMs: number[] = []
  const filteredLines: string[] = []

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue
    }

    const parsed = parseJsonRecord(line)
    if (!parsed) {
      filteredLines.push(line)
      continue
    }

    const tsMs = parseTimestampMs(asString(parsed.timestamp))
    if (tsMs !== null) {
      timestampsMs.push(tsMs)
    }

    if (projectDir === UNKNOWN_PROJECT) {
      const cwd = readProjectDirFromSessionMeta(parsed)
      if (cwd) {
        projectDir = cwd
      }
    }

    if (!shouldExcludePreviewEntry(parsed)) {
      filteredLines.push(line)
    }
  }

  return {
    projectDir,
    timestampsMs,
    filteredContent: filteredLines.join('\n'),
  }
}

export const buildConversationSegments = (
  timestampsMs: number[],
  fallbackMs: number,
  breakLimitMinutes: number,
): SessionSegment[] => {
  // Files without timestamps still need a usable timeline anchor.
  if (timestampsMs.length === 0) {
    return [
      {
        startedAt: new Date(fallbackMs).toISOString(),
        endedAt: new Date(fallbackMs).toISOString(),
      },
    ]
  }

  const sorted = [...timestampsMs].sort((a, b) => a - b)
  const breakLimitMs = breakLimitMinutes * 60_000
  const segments: SessionSegment[] = []
  let segmentStart = sorted[0]
  let previous = sorted[0]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (current - previous > breakLimitMs) {
      segments.push({
        startedAt: new Date(segmentStart).toISOString(),
        endedAt: new Date(previous).toISOString(),
      })
      segmentStart = current
    }
    previous = current
  }

  segments.push({
    startedAt: new Date(segmentStart).toISOString(),
    endedAt: new Date(previous).toISOString(),
  })

  return segments
}

export const toSessionSummary = (
  session: ProcessedSession,
  breakLimitMinutes: number,
): SessionSummary => {
  // Segment boundaries are driven by inactivity gaps, not by file naming or folder boundaries.
  const fallbackMs = parseTimestampMs(session.modifiedAt) ?? Date.now()
  const segments = buildConversationSegments(session.timestampsMs, fallbackMs, breakLimitMinutes)
  const startedAt = segments[0]?.startedAt ?? new Date(fallbackMs).toISOString()
  const endedAt = segments[segments.length - 1]?.endedAt ?? startedAt

  return {
    projectDir: session.projectDir,
    startedAt,
    endedAt,
    segments,
  }
}
