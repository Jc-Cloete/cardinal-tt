import {Database} from 'bun:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import type {
  CardinalCommit,
  CardinalCommitEntry,
  CardinalDiffEntry,
  CardinalFileHistoryEntry,
  CardinalProject,
} from '../types'
import {cacheDbPath} from '../config'
import {asString} from '../utils/json'

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseJson = (value: string | null): Record<string, unknown> | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

fs.mkdirSync(path.dirname(cacheDbPath), {recursive: true})
const db = new Database(cacheDbPath)

db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS cardinal_projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    ignore_rules_json TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'metadata',
    hash_policy TEXT NOT NULL DEFAULT 'off',
    max_blob_size_bytes INTEGER NOT NULL DEFAULT 5242880,
    debounce_ms INTEGER NOT NULL DEFAULT 500,
    commit_idle_ms INTEGER NOT NULL DEFAULT 2000,
    commit_max_interval_ms INTEGER NOT NULL DEFAULT 60000,
    last_event_cursor TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cardinal_commits (
    commit_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_commit_id TEXT,
    sequence_no INTEGER NOT NULL,
    started_at_ns INTEGER NOT NULL,
    ended_at_ns INTEGER NOT NULL,
    event_cursor_start TEXT,
    event_cursor_end TEXT,
    change_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cardinal_commit_entries (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    ended_at_ns INTEGER NOT NULL DEFAULT 0,
    rel_path TEXT NOT NULL,
    op TEXT NOT NULL,
    old_rel_path TEXT,
    before_json TEXT,
    after_json TEXT,
    blob_before TEXT,
    blob_after TEXT,
    content_hash_before TEXT,
    content_hash_after TEXT
  );
`)

const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>
  const hasColumn = columns.some((item) => asString(item.name) === column)
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

addColumnIfMissing('cardinal_projects', 'hash_policy', "hash_policy TEXT NOT NULL DEFAULT 'off'")
addColumnIfMissing('cardinal_commit_entries', 'blob_before', 'blob_before TEXT')
addColumnIfMissing('cardinal_commit_entries', 'blob_after', 'blob_after TEXT')
addColumnIfMissing('cardinal_commit_entries', 'content_hash_before', 'content_hash_before TEXT')
addColumnIfMissing('cardinal_commit_entries', 'content_hash_after', 'content_hash_after TEXT')
addColumnIfMissing('cardinal_commit_entries', 'ended_at_ns', 'ended_at_ns INTEGER NOT NULL DEFAULT 0')

const listProjectsStmt = db.query(`
  SELECT project_id, name, root_path, enabled, mode, hash_policy, updated_at
  FROM cardinal_projects
  ORDER BY lower(name) ASC
`)

const getProjectStmt = db.query(`
  SELECT project_id, name, root_path, enabled, mode, hash_policy, updated_at
  FROM cardinal_projects
  WHERE project_id = ?1
  LIMIT 1
`)

const listCommitsStmt = db.query(`
  SELECT
    commit_id,
    project_id,
    parent_commit_id,
    sequence_no,
    started_at_ns,
    ended_at_ns,
    event_cursor_start,
    event_cursor_end,
    change_count
  FROM cardinal_commits
  WHERE (?1 = '' OR project_id = ?1)
    AND (?2 IS NULL OR ended_at_ns >= ?2)
    AND (?3 IS NULL OR ended_at_ns <= ?3)
  ORDER BY ended_at_ns DESC
  LIMIT ?4
`)

const listCommitsBySequenceRangeStmt = db.query(`
  SELECT
    commit_id,
    project_id,
    parent_commit_id,
    sequence_no,
    started_at_ns,
    ended_at_ns,
    event_cursor_start,
    event_cursor_end,
    change_count
  FROM cardinal_commits
  WHERE project_id = ?1
    AND sequence_no >= ?2
    AND sequence_no <= ?3
  ORDER BY sequence_no ASC
`)

const getCommitStmt = db.query(`
  SELECT
    commit_id,
    project_id,
    parent_commit_id,
    sequence_no,
    started_at_ns,
    ended_at_ns,
    event_cursor_start,
    event_cursor_end,
    change_count
  FROM cardinal_commits
  WHERE commit_id = ?1
  LIMIT 1
`)

const getCommitEntriesStmt = db.query(`
  SELECT
    rel_path,
    op,
    old_rel_path,
    before_json,
    after_json,
    blob_before,
    blob_after,
    content_hash_before,
    content_hash_after
  FROM cardinal_commit_entries
  WHERE commit_id = ?1
  ORDER BY entry_id ASC
`)

const fileHistoryStmt = db.query(`
  SELECT
    ce.commit_id,
    ce.rel_path,
    ce.op,
    ce.old_rel_path,
    ce.before_json,
    ce.after_json,
    ce.blob_before,
    ce.blob_after,
    ce.content_hash_before,
    ce.content_hash_after,
    cc.sequence_no,
    cc.started_at_ns,
    cc.ended_at_ns
  FROM cardinal_commit_entries ce
  INNER JOIN cardinal_commits cc ON cc.commit_id = ce.commit_id
  WHERE ce.project_id = ?1
    AND (ce.rel_path = ?2 OR ce.old_rel_path = ?2)
  ORDER BY cc.sequence_no DESC
  LIMIT ?3
`)

const toProject = (row: Record<string, unknown>): CardinalProject => ({
  projectId: asString(row.project_id) || '',
  name: asString(row.name) || '',
  rootPath: asString(row.root_path) || '',
  enabled: Number(row.enabled) === 1,
  mode: asString(row.mode) || 'metadata',
  hashPolicy: asString(row.hash_policy) || 'off',
  updatedAt: asString(row.updated_at) || '',
})

const toCommit = (row: Record<string, unknown>): CardinalCommit => ({
  commitId: asString(row.commit_id) || '',
  projectId: asString(row.project_id) || '',
  parentCommitId: asString(row.parent_commit_id),
  sequenceNo: asNumber(row.sequence_no) ?? 0,
  startedAtNs: asNumber(row.started_at_ns) ?? 0,
  endedAtNs: asNumber(row.ended_at_ns) ?? 0,
  eventCursorStart: asString(row.event_cursor_start),
  eventCursorEnd: asString(row.event_cursor_end),
  changeCount: asNumber(row.change_count) ?? 0,
})

const toCommitEntry = (row: Record<string, unknown>): CardinalCommitEntry => ({
  relPath: asString(row.rel_path) || '',
  op: asString(row.op) || '',
  oldRelPath: asString(row.old_rel_path),
  before: parseJson(asString(row.before_json)),
  after: parseJson(asString(row.after_json)),
  blobBefore: asString(row.blob_before) || asString(row.content_hash_before),
  blobAfter: asString(row.blob_after) || asString(row.content_hash_after),
})

export const listCardinalProjects = (): CardinalProject[] =>
  (listProjectsStmt.all() as Array<Record<string, unknown>>).map(toProject)

export const getCardinalProject = (projectId: string): CardinalProject | null => {
  const row = getProjectStmt.get(projectId) as Record<string, unknown> | null
  return row ? toProject(row) : null
}

export const listCardinalCommits = (args: {
  projectId?: string
  limit: number
  sinceNs?: number
  untilNs?: number
}): CardinalCommit[] =>
  (
    listCommitsStmt.all(
      args.projectId || '',
      args.sinceNs ?? null,
      args.untilNs ?? null,
      args.limit,
    ) as Array<Record<string, unknown>>
  ).map(toCommit)

export const listCardinalCommitsBySequenceRange = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
}): CardinalCommit[] =>
  (
    listCommitsBySequenceRangeStmt.all(
      args.projectId,
      Math.min(args.fromSequence, args.toSequence),
      Math.max(args.fromSequence, args.toSequence),
    ) as Array<Record<string, unknown>>
  ).map(toCommit)

export const getCardinalCommit = (commitId: string): CardinalCommit | null => {
  const row = getCommitStmt.get(commitId) as Record<string, unknown> | null
  if (!row) {
    return null
  }

  return toCommit(row)
}

export const getCardinalCommitEntries = (commitId: string): CardinalCommitEntry[] =>
  (getCommitEntriesStmt.all(commitId) as Array<Record<string, unknown>>).map(toCommitEntry)

export const getCardinalFileHistory = (
  projectId: string,
  relPath: string,
  limit: number,
): CardinalFileHistoryEntry[] =>
  (fileHistoryStmt.all(projectId, relPath, limit) as Array<Record<string, unknown>>).map((row) => ({
    commitId: asString(row.commit_id) || '',
    relPath: asString(row.rel_path) || '',
    op: asString(row.op) || '',
    oldRelPath: asString(row.old_rel_path),
    before: parseJson(asString(row.before_json)),
    after: parseJson(asString(row.after_json)),
    sequenceNo: asNumber(row.sequence_no) ?? 0,
    startedAtNs: asNumber(row.started_at_ns) ?? 0,
    endedAtNs: asNumber(row.ended_at_ns) ?? 0,
    blobBefore: asString(row.blob_before) || asString(row.content_hash_before),
    blobAfter: asString(row.blob_after) || asString(row.content_hash_after),
  }))

export const getCardinalDiffEntries = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
  relPath?: string
}): CardinalDiffEntry[] => {
  const commits = listCardinalCommitsBySequenceRange({
    projectId: args.projectId,
    fromSequence: args.fromSequence,
    toSequence: args.toSequence,
  })

  return commits.flatMap((commit) =>
    getCardinalCommitEntries(commit.commitId)
      .filter((entry) =>
        args.relPath
          ? entry.relPath === args.relPath || entry.oldRelPath === args.relPath
          : true,
      )
      .map((entry) => ({
        commitId: commit.commitId,
        sequenceNo: commit.sequenceNo,
        startedAtNs: commit.startedAtNs,
        endedAtNs: commit.endedAtNs,
        relPath: entry.relPath,
        op: entry.op,
        oldRelPath: entry.oldRelPath,
        before: entry.before,
        after: entry.after,
        blobBefore: entry.blobBefore,
        blobAfter: entry.blobAfter,
        diffKind: 'metadata',
        patch: null,
        patchTruncated: false,
      })),
  )
}
