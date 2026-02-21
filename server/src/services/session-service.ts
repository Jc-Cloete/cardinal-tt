import fs from 'node:fs'
import path from 'node:path'
import { getCachedSession, saveCachedSession } from '../cache/session-cache'
import { dataRoot } from '../config'
import { parseSessionFileContent, toSessionSummary } from '../domain/session-parser'
import { serverLogger } from '../observability/logger'
import type { ProcessedSession, SessionFile } from '../types'
import { readDir, toPosixPath } from '../utils/fs-paths'
import { computeStableHash } from '../utils/hash'

// Day key normalizes source paths for cache lookup stability across OS path separators.
const getDayKey = (dayPath: string): string => toPosixPath(path.relative(dataRoot, dayPath))

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
): SessionFile[] => {
  const operationLogger = serverLogger.child({
    component: 'session-service',
    day_path: dayPath,
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
      const dayKey = getDayKey(dayPath)
      const files: SessionFile[] = []
      const entries = readDir(dayPath).filter(
        (entry) => entry.type === 'file' && entry.name.endsWith('.jsonl'),
      )

      for (const entry of entries) {
        const filePath = path.join(dayPath, entry.name)

        try {
          const processed = getProcessedSession(filePath, entry.name, dayKey, forceRefresh)
          const summary = toSessionSummary(processed, breakLimitMinutes)

          files.push({
            name: entry.name,
            projectDir: summary.projectDir,
            startedAt: summary.startedAt,
            endedAt: summary.endedAt,
            segments: summary.segments,
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
              file_name: entry.name,
            },
          })
        }
      }

      const sorted = files.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      operationLogger.log({
        event: 'server.sessions.day.summary',
        fields: {
          file_count: sorted.length,
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
      const dayKey = getDayKey(path.dirname(filePath))
      const processed = getProcessedSession(filePath, path.basename(filePath), dayKey, forceRefresh)
      return processed.filteredContent
    },
  )
}
