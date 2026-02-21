import {Database} from 'bun:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {UNKNOWN_PROJECT, cacheDbPath} from '../config'
import type {ProcessedSession} from '../types'
import {asRecord, asString} from '../utils/json'

type SessionCacheRow = {
  file_path: string
  day_key: string
  file_name: string
  file_hash: string
  file_size: number
  file_mtime: string
  project_dir: string
  timestamps_json: string
  filtered_content: string
  updated_at: string
}

fs.mkdirSync(path.dirname(cacheDbPath), {recursive: true})

const sessionCacheDb = new Database(cacheDbPath)

sessionCacheDb.exec(`
  CREATE TABLE IF NOT EXISTS session_cache (
    file_path TEXT PRIMARY KEY,
    day_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_mtime TEXT NOT NULL,
    project_dir TEXT NOT NULL,
    timestamps_json TEXT NOT NULL,
    filtered_content TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_session_cache_day_key ON session_cache (day_key);
`)

const selectSessionCacheByPathStmt = sessionCacheDb.query(`
  SELECT
    file_path,
    day_key,
    file_name,
    file_hash,
    file_size,
    file_mtime,
    project_dir,
    timestamps_json,
    filtered_content,
    updated_at
  FROM session_cache
  WHERE file_path = ?1
  LIMIT 1
`)

const upsertSessionCacheStmt = sessionCacheDb.query(`
  INSERT INTO session_cache (
    file_path,
    day_key,
    file_name,
    file_hash,
    file_size,
    file_mtime,
    project_dir,
    timestamps_json,
    filtered_content,
    updated_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT(file_path) DO UPDATE SET
    day_key = excluded.day_key,
    file_name = excluded.file_name,
    file_hash = excluded.file_hash,
    file_size = excluded.file_size,
    file_mtime = excluded.file_mtime,
    project_dir = excluded.project_dir,
    timestamps_json = excluded.timestamps_json,
    filtered_content = excluded.filtered_content,
    updated_at = excluded.updated_at
`)

const parseStoredTimestamps = (json: string): number[] => {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  } catch {
    return []
  }
}

const toSessionCacheRow = (value: unknown): SessionCacheRow | null => {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const filePath = asString(record.file_path)
  const dayKey = asString(record.day_key)
  const fileName = asString(record.file_name)
  const fileHash = asString(record.file_hash)
  const fileMtime = asString(record.file_mtime)
  const projectDir = asString(record.project_dir)
  const timestampsJson = asString(record.timestamps_json)
  const filteredContent = asString(record.filtered_content)
  const updatedAt = asString(record.updated_at)
  const fileSizeRaw = record.file_size
  const fileSize = typeof fileSizeRaw === 'number' ? fileSizeRaw : Number(fileSizeRaw)

  if (
    !filePath ||
    !dayKey ||
    !fileName ||
    !fileHash ||
    !fileMtime ||
    !projectDir ||
    !timestampsJson ||
    filteredContent === null ||
    !updatedAt ||
    !Number.isFinite(fileSize)
  ) {
    return null
  }

  return {
    file_path: filePath,
    day_key: dayKey,
    file_name: fileName,
    file_hash: fileHash,
    file_size: fileSize,
    file_mtime: fileMtime,
    project_dir: projectDir,
    timestamps_json: timestampsJson,
    filtered_content: filteredContent,
    updated_at: updatedAt,
  }
}

const rowToProcessedSession = (row: SessionCacheRow): ProcessedSession => ({
  filePath: row.file_path,
  dayKey: row.day_key,
  name: row.file_name,
  fileHash: row.file_hash,
  sizeBytes: Number(row.file_size),
  modifiedAt: row.file_mtime,
  projectDir: row.project_dir || UNKNOWN_PROJECT,
  timestampsMs: parseStoredTimestamps(row.timestamps_json),
  filteredContent: row.filtered_content || '',
})

export const getCachedSession = (filePath: string): ProcessedSession | null => {
  const row = toSessionCacheRow(selectSessionCacheByPathStmt.get(filePath))
  if (!row) {
    return null
  }

  return rowToProcessedSession(row)
}

export const saveCachedSession = (session: ProcessedSession): void => {
  const updatedAt = new Date().toISOString()
  upsertSessionCacheStmt.run(
    session.filePath,
    session.dayKey,
    session.name,
    session.fileHash,
    session.sizeBytes,
    session.modifiedAt,
    session.projectDir,
    JSON.stringify(session.timestampsMs),
    session.filteredContent,
    updatedAt,
  )
}
