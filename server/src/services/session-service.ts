import fs from 'node:fs'
import path from 'node:path'
import {dataRoot} from '../config'
import {getCachedSession, saveCachedSession} from '../cache/session-cache'
import {parseSessionFileContent, toSessionSummary} from '../domain/session-parser'
import type {ProcessedSession, SessionFile} from '../types'
import {readDir, toPosixPath} from '../utils/fs-paths'
import {computeStableHash} from '../utils/hash'

const getDayKey = (dayPath: string): string =>
  toPosixPath(path.relative(dataRoot, dayPath))

const getProcessedSession = (
  filePath: string,
  fileName: string,
  dayKey: string,
  forceRefresh: boolean,
): ProcessedSession => {
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
    return cached
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const fileHash = computeStableHash(content)

  if (cached && !forceRefresh && cached.fileHash === fileHash) {
    const updatedCache: ProcessedSession = {
      ...cached,
      dayKey,
      name: fileName,
      sizeBytes,
      modifiedAt,
    }
    saveCachedSession(updatedCache)
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
  return processed
}

export const getDaySessions = (
  dayPath: string,
  breakLimitMinutes: number,
  forceRefresh: boolean,
): SessionFile[] => {
  const dayKey = getDayKey(dayPath)
  const files: SessionFile[] = []
  const entries = readDir(dayPath).filter((entry) => entry.type === 'file' && entry.name.endsWith('.jsonl'))

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
    } catch {
      continue
    }
  }

  return files.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
}

export const getFilteredFileContent = (filePath: string, forceRefresh: boolean): string => {
  const dayKey = getDayKey(path.dirname(filePath))
  const processed = getProcessedSession(filePath, path.basename(filePath), dayKey, forceRefresh)
  return processed.filteredContent
}
