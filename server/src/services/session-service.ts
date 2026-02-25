import fs from 'node:fs'
import path from 'node:path'
import { getCachedSession, saveCachedSession } from '../cache/session-cache'
import { dataRoot } from '../config'
import { parseSessionFileContent, toSessionSummary } from '../domain/session-parser'
import { serverLogger } from '../observability/logger'
import type { ProcessedSession, SessionFile } from '../types'
import { readDir, toPosixPath } from '../utils/fs-paths'
import { computeStableHash } from '../utils/hash'

type DayBounds = {
  startMs: number
  endMs: number
}

type SessionFileEntry = {
  filePath: string
  fileName: string
  dayKey: string
  relativePath: string
}

// Day key normalizes source paths for cache lookup stability across OS path separators.
const getDayKey = (rootPath: string, dayPath: string): string =>
  toPosixPath(path.relative(rootPath, dayPath))

const parseDayBoundsFromDayKey = (dayKey: string): DayBounds | null => {
  const parts = dayKey
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 3) {
    return null
  }

  const [yearPart, monthPart, dayPart] = parts.slice(-3)
  const year = Number.parseInt(yearPart, 10)
  const month = Number.parseInt(monthPart, 10)
  const day = Number.parseInt(dayPart, 10)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  const endMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - 1
  return {
    startMs,
    endMs,
  }
}

const toSessionFileEntry = (
  rootPath: string,
  dayPath: string,
  fileName: string,
): SessionFileEntry => {
  const filePath = path.join(dayPath, fileName)
  const dayKey = getDayKey(rootPath, dayPath)

  return {
    filePath,
    fileName,
    dayKey,
    relativePath: toPosixPath(path.relative(rootPath, filePath)),
  }
}

const listSessionFilesByDayLayout = (rootPath: string): SessionFileEntry[] => {
  const files: SessionFileEntry[] = []
  const years = readDir(rootPath).filter((entry) => entry.type === 'dir')

  for (const yearEntry of years) {
    const yearPath = path.join(rootPath, yearEntry.name)
    const months = readDir(yearPath).filter((entry) => entry.type === 'dir')

    for (const monthEntry of months) {
      const monthPath = path.join(yearPath, monthEntry.name)
      const days = readDir(monthPath).filter((entry) => entry.type === 'dir')

      for (const dayEntry of days) {
        const dayPath = path.join(monthPath, dayEntry.name)
        const dayFiles = readDir(dayPath).filter(
          (entry) => entry.type === 'file' && entry.name.endsWith('.jsonl'),
        )

        for (const fileEntry of dayFiles) {
          files.push(toSessionFileEntry(rootPath, dayPath, fileEntry.name))
        }
      }
    }
  }

  return files
}

const doesSegmentOverlapDay = (
  segmentStartedAt: string,
  segmentEndedAt: string,
  dayBounds: DayBounds,
): boolean => {
  const segmentStartMs = Date.parse(segmentStartedAt)
  const segmentEndMs = Date.parse(segmentEndedAt)
  if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs)) {
    return false
  }

  const normalizedEndMs = Math.max(segmentStartMs, segmentEndMs)
  return segmentStartMs <= dayBounds.endMs && normalizedEndMs >= dayBounds.startMs
}

const doesSummaryOverlapDay = (
  summary: ReturnType<typeof toSessionSummary>,
  dayBounds: DayBounds,
): boolean => {
  if (Array.isArray(summary.segments) && summary.segments.length > 0) {
    return summary.segments.some((segment) =>
      doesSegmentOverlapDay(segment.startedAt, segment.endedAt, dayBounds),
    )
  }

  return doesSegmentOverlapDay(summary.startedAt, summary.endedAt, dayBounds)
}

const clipSegmentToDay = (
  segmentStartedAt: string,
  segmentEndedAt: string,
  dayBounds: DayBounds,
): { startedAt: string; endedAt: string } | null => {
  const segmentStartMs = Date.parse(segmentStartedAt)
  const segmentEndMs = Date.parse(segmentEndedAt)
  if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs)) {
    return null
  }

  const normalizedStartMs = Math.min(segmentStartMs, segmentEndMs)
  const normalizedEndMs = Math.max(segmentStartMs, segmentEndMs)
  const clippedStartMs = Math.max(normalizedStartMs, dayBounds.startMs)
  const clippedEndMs = Math.min(normalizedEndMs, dayBounds.endMs)

  if (clippedStartMs > clippedEndMs) {
    return null
  }

  return {
    startedAt: new Date(clippedStartMs).toISOString(),
    endedAt: new Date(clippedEndMs).toISOString(),
  }
}

const clipSummaryToDay = (
  summary: ReturnType<typeof toSessionSummary>,
  dayBounds: DayBounds,
): ReturnType<typeof toSessionSummary> | null => {
  const sourceSegments =
    Array.isArray(summary.segments) && summary.segments.length > 0
      ? summary.segments
      : [{ startedAt: summary.startedAt, endedAt: summary.endedAt }]
  const clippedSegments = sourceSegments
    .map((segment) => clipSegmentToDay(segment.startedAt, segment.endedAt, dayBounds))
    .filter((segment): segment is { startedAt: string; endedAt: string } => segment !== null)

  if (clippedSegments.length === 0) {
    return null
  }

  return {
    ...summary,
    startedAt: clippedSegments[0]?.startedAt || summary.startedAt,
    endedAt: clippedSegments[clippedSegments.length - 1]?.endedAt || summary.endedAt,
    segments: clippedSegments,
  }
}

const getProcessedSession = (
  filePath: string,
  fileName: string,
  dayKey: string,
  forceRefresh: boolean,
): ProcessedSession => {
  const startedAt = Date.now()
  const operationLogger = serverLogger.child({
    component: 'session-service',
    day_key: dayKey,
    file_name: fileName,
  })

  const stat = fs.statSync(filePath)
  const modifiedAt = stat.mtime.toISOString()
  const sizeBytes = stat.size
  const cached = getCachedSession(filePath)

  if (
    cached &&
    !forceRefresh &&
    cached.sizeBytes === sizeBytes &&
    cached.modifiedAt === modifiedAt
  ) {
    // Fast path: file metadata unchanged, cached parse is still valid.
    operationLogger.log({
      event: 'server.sessions.file.process',
      fields: {
        cache_state: 'hit_mtime',
        force_refresh: forceRefresh,
        size_bytes: sizeBytes,
        duration_ms: Date.now() - startedAt,
      },
    })
    return cached
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const fileHash = computeStableHash(content)

  if (cached && !forceRefresh && cached.fileHash === fileHash) {
    // Content unchanged but metadata changed (for example move between day folders).
    const updatedCache: ProcessedSession = {
      ...cached,
      dayKey,
      name: fileName,
      sizeBytes,
      modifiedAt,
    }
    saveCachedSession(updatedCache)
    operationLogger.log({
      event: 'server.sessions.file.process',
      fields: {
        cache_state: 'hit_hash',
        force_refresh: forceRefresh,
        size_bytes: sizeBytes,
        duration_ms: Date.now() - startedAt,
      },
    })
    return updatedCache
  }

  const parsed = parseSessionFileContent(content)
  const processed: ProcessedSession = {
    filePath,
    dayKey,
    name: fileName,
    fileHash,
    sizeBytes,
    modifiedAt,
    projectDir: parsed.projectDir,
    timestampsMs: parsed.timestampsMs,
    filteredContent: parsed.filteredContent,
  }
  saveCachedSession(processed)
  operationLogger.log({
    event: 'server.sessions.file.process',
    fields: {
      cache_state: 'miss',
      force_refresh: forceRefresh,
      size_bytes: sizeBytes,
      timestamp_count: processed.timestampsMs.length,
      duration_ms: Date.now() - startedAt,
    },
  })
  return processed
}

export const getDaySessions = (
  dayPath: string,
  breakLimitMinutes: number,
  forceRefresh: boolean,
  rootPath: string = dataRoot,
): SessionFile[] => {
  const dayKey = getDayKey(rootPath, dayPath)
  const selectedDayBounds = parseDayBoundsFromDayKey(dayKey)
  const operationLogger = serverLogger.child({
    component: 'session-service',
    day_path: dayPath,
    day_key: dayKey,
  })

  return operationLogger.run(
    {
      event: 'server.sessions.day.process',
      fields: {
        break_limit_minutes: breakLimitMinutes,
        force_refresh: forceRefresh,
      },
    },
    () => {
      const files: SessionFile[] = []
      const entries = listSessionFilesByDayLayout(rootPath)

      for (const entry of entries) {
        const { filePath, fileName, dayKey: sourceDayKey, relativePath } = entry

        try {
          const processed = getProcessedSession(filePath, fileName, sourceDayKey, forceRefresh)
          const summary = toSessionSummary(processed, breakLimitMinutes)
          const clippedSummary =
            selectedDayBounds === null
              ? summary
              : doesSummaryOverlapDay(summary, selectedDayBounds)
                ? clipSummaryToDay(summary, selectedDayBounds)
                : null

          if (clippedSummary === null) {
            continue
          }

          files.push({
            name: fileName,
            relativePath,
            projectDir: clippedSummary.projectDir,
            startedAt: clippedSummary.startedAt,
            endedAt: clippedSummary.endedAt,
            segments: clippedSummary.segments,
            sizeBytes: processed.sizeBytes,
            modifiedAt: processed.modifiedAt,
          })
        } catch (error) {
          operationLogger.log({
            event: 'server.sessions.file.skip',
            level: 'warn',
            outcome: 'error',
            error: error instanceof Error ? error : String(error),
            fields: {
              file_name: fileName,
              relative_path: relativePath,
            },
          })
        }
      }

      const sorted = files.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      operationLogger.log({
        event: 'server.sessions.day.summary',
        fields: {
          file_count: sorted.length,
          total_file_count: entries.length,
          day_key: dayKey,
        },
      })
      return sorted
    },
  )
}

export const getFilteredFileContent = (filePath: string, forceRefresh: boolean): string => {
  const operationLogger = serverLogger.child({
    component: 'session-service',
    file_path: filePath,
  })

  return operationLogger.run(
    {
      event: 'server.sessions.preview.render',
      fields: {
        force_refresh: forceRefresh,
      },
    },
    () => {
      const dayKey = getDayKey(dataRoot, path.dirname(filePath))
      const processed = getProcessedSession(filePath, path.basename(filePath), dayKey, forceRefresh)
      return processed.filteredContent
    },
  )
}
