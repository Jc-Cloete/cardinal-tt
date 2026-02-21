import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { WideEventObject } from 'cardinal-observability'
import {
  DEFAULT_COMMIT_IDLE_MS,
  DEFAULT_COMMIT_MAX_INTERVAL_MS,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_MAX_BLOB_SIZE_BYTES,
} from './defaults'
import { storeLogger } from './observability'
import type {
  ChangedEntry,
  CommitEntryRow,
  CommitRecord,
  HashPolicy,
  HeartbeatRow,
  IndexEntry,
  JsonObject,
  JsonValue,
  ProjectConfig,
  ProjectMode,
  ScanStats,
} from './types'

// SQLite exposes row values as dynamic data; these helpers keep conversion strict and local.
const asString = (value: JsonValue): string | null => (typeof value === 'string' ? value : null)

const asNumber = (value: JsonValue): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseIgnoreRules = (value: JsonValue): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as JsonValue
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_IGNORE_PATTERNS]
    }

    const rules = parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    return rules.length > 0 ? rules : [...DEFAULT_IGNORE_PATTERNS]
  } catch {
    return [...DEFAULT_IGNORE_PATTERNS]
  }
}

const toProjectConfig = (value: JsonValue): ProjectConfig | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const projectId = asString(row.project_id)
  const name = asString(row.name)
  const rootPath = asString(row.root_path)
  const modeRaw = asString(row.mode)
  if (!projectId || !name || !rootPath || !modeRaw) {
    return null
  }

  const mode: ProjectMode = modeRaw === 'content' ? 'content' : 'metadata'
  const hashPolicyRaw = asString(row.hash_policy)
  const hashPolicy: HashPolicy = hashPolicyRaw === 'on_change' ? 'on_change' : 'off'
  return {
    projectId,
    name,
    rootPath,
    enabled: Number(row.enabled) === 1,
    ignoreRules: parseIgnoreRules(row.ignore_rules_json),
    mode,
    hashPolicy,
    maxBlobSizeBytes: asNumber(row.max_blob_size_bytes) ?? DEFAULT_MAX_BLOB_SIZE_BYTES,
    debounceMs: asNumber(row.debounce_ms) ?? DEFAULT_DEBOUNCE_MS,
    commitIdleMs: asNumber(row.commit_idle_ms) ?? DEFAULT_COMMIT_IDLE_MS,
    commitMaxIntervalMs: asNumber(row.commit_max_interval_ms) ?? DEFAULT_COMMIT_MAX_INTERVAL_MS,
    lastEventCursor: asString(row.last_event_cursor),
  }
}

const toCommitRecord = (value: JsonValue): CommitRecord | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const commitId = asString(row.commit_id)
  const projectId = asString(row.project_id)
  if (!commitId || !projectId) {
    return null
  }

  return {
    commitId,
    projectId,
    parentCommitId: asString(row.parent_commit_id),
    sequenceNo: asNumber(row.sequence_no) ?? 0,
    startedAtNs: asNumber(row.started_at_ns) ?? 0,
    endedAtNs: asNumber(row.ended_at_ns) ?? 0,
    eventCursorStart: asString(row.event_cursor_start),
    eventCursorEnd: asString(row.event_cursor_end),
    changeCount: asNumber(row.change_count) ?? 0,
  }
}

type CardinalStore = {
  listProjects: () => ProjectConfig[]
  getProjectById: (projectId: string) => ProjectConfig | null
  getProjectByRootPath: (rootPath: string) => ProjectConfig | null
  addProject: (input: {
    name: string
    rootPath: string
    mode: ProjectMode
    hashPolicy: HashPolicy
    ignoreRules: string[]
  }) => ProjectConfig
  removeProject: (projectId: string) => void
  readIndex: (projectId: string) => Map<string, IndexEntry>
  writeCommit: (input: {
    projectId: string
    startedAtNs: number
    endedAtNs: number
    eventCursorStart: string | null
    eventCursorEnd: string | null
    changes: ChangedEntry[]
    nextIndex: Map<string, IndexEntry>
  }) => CommitRecord | null
  setProjectIndexSnapshot: (args: {
    projectId: string
    index: Map<string, IndexEntry>
    cursor: string | null
  }) => void
  touchProjectCursor: (projectId: string, cursor: string | null) => void
  recordProjectMetrics: (args: {
    projectId: string
    queueDepth: number
    scanStats: ScanStats
    changes: number
  }) => void
  recordHeartbeat: (args: { projectCount: number; agentPid: number }) => void
  getLatestHeartbeat: () => HeartbeatRow | null
  listCommits: (args: {
    projectId: string
    sinceNs?: number
    untilNs?: number
    limit?: number
  }) => CommitRecord[]
  listCommitsBySequenceRange: (args: {
    projectId: string
    fromSequence: number
    toSequence: number
  }) => CommitRecord[]
  getCommit: (commitId: string) => CommitRecord | null
  getCommitEntries: (commitId: string) => CommitEntryRow[]
  getFileHistory: (args: {
    projectId: string
    relPath: string
    limit?: number
  }) => Array<JsonObject>
}

export const createCardinalStore = (dbPath: string): CardinalStore => {
  const logger = storeLogger.child({
    component: 'db',
    db_path: dbPath,
  })
  const initializeStartedAt = Date.now()

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)

  // Schema is intentionally centralized so server + agent share identical storage guarantees.
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;

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

    CREATE TABLE IF NOT EXISTS cardinal_index_entries (
      project_id TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ns INTEGER NOT NULL,
      inode INTEGER NOT NULL,
      device INTEGER NOT NULL,
      mode_bits INTEGER,
      hash TEXT,
      symlink_target TEXT,
      PRIMARY KEY (project_id, rel_path),
      FOREIGN KEY (project_id) REFERENCES cardinal_projects(project_id) ON DELETE CASCADE
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
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES cardinal_projects(project_id) ON DELETE CASCADE
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
      content_hash_after TEXT,
      FOREIGN KEY (commit_id) REFERENCES cardinal_commits(commit_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cardinal_metrics (
      metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cardinal_commits_project_time ON cardinal_commits(project_id, ended_at_ns);
    CREATE INDEX IF NOT EXISTS idx_cardinal_metrics_project_time ON cardinal_metrics(project_id, created_at);
  `)

  const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
    // Lightweight migration helper for additive schema updates.
    const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<JsonObject>
    const hasColumn = columns.some((item) => asString(item.name) === column)
    if (!hasColumn) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    }
  }

  addColumnIfMissing('cardinal_commit_entries', 'blob_before', 'blob_before TEXT')
  addColumnIfMissing('cardinal_commit_entries', 'blob_after', 'blob_after TEXT')
  addColumnIfMissing('cardinal_commit_entries', 'content_hash_before', 'content_hash_before TEXT')
  addColumnIfMissing('cardinal_commit_entries', 'content_hash_after', 'content_hash_after TEXT')
  addColumnIfMissing(
    'cardinal_commit_entries',
    'ended_at_ns',
    'ended_at_ns INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing('cardinal_projects', 'hash_policy', "hash_policy TEXT NOT NULL DEFAULT 'off'")

  db.exec(`
    DROP INDEX IF EXISTS idx_cardinal_entries_project_path_time;
    CREATE INDEX IF NOT EXISTS idx_cardinal_entries_project_path_time
    ON cardinal_commit_entries(project_id, rel_path, ended_at_ns);
  `)

  const selectProjectsStmt = db.query(`
    SELECT
      project_id,
      name,
      root_path,
      enabled,
      ignore_rules_json,
      mode,
      hash_policy,
      max_blob_size_bytes,
      debounce_ms,
      commit_idle_ms,
      commit_max_interval_ms,
      last_event_cursor
    FROM cardinal_projects
    ORDER BY lower(name) ASC
  `)

  const selectProjectByIdStmt = db.query(`
    SELECT
      project_id,
      name,
      root_path,
      enabled,
      ignore_rules_json,
      mode,
      hash_policy,
      max_blob_size_bytes,
      debounce_ms,
      commit_idle_ms,
      commit_max_interval_ms,
      last_event_cursor
    FROM cardinal_projects
    WHERE project_id = ?1
    LIMIT 1
  `)

  const selectProjectByRootPathStmt = db.query(`
    SELECT
      project_id,
      name,
      root_path,
      enabled,
      ignore_rules_json,
      mode,
      hash_policy,
      max_blob_size_bytes,
      debounce_ms,
      commit_idle_ms,
      commit_max_interval_ms,
      last_event_cursor
    FROM cardinal_projects
    WHERE root_path = ?1
    LIMIT 1
  `)

  const insertProjectStmt = db.query(`
    INSERT INTO cardinal_projects (
      project_id,
      name,
      root_path,
      enabled,
      ignore_rules_json,
      mode,
      hash_policy,
      max_blob_size_bytes,
      debounce_ms,
      commit_idle_ms,
      commit_max_interval_ms,
      last_event_cursor,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
  `)

  const removeProjectStmt = db.query(`DELETE FROM cardinal_projects WHERE project_id = ?1`)
  const clearProjectIndexStmt = db.query(`DELETE FROM cardinal_index_entries WHERE project_id = ?1`)

  const insertIndexEntryStmt = db.query(`
    INSERT INTO cardinal_index_entries (
      project_id,
      rel_path,
      kind,
      size,
      mtime_ns,
      inode,
      device,
      mode_bits,
      hash,
      symlink_target
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `)

  const selectProjectIndexStmt = db.query(`
    SELECT
      rel_path,
      kind,
      size,
      mtime_ns,
      inode,
      device,
      mode_bits,
      hash,
      symlink_target
    FROM cardinal_index_entries
    WHERE project_id = ?1
  `)

  const selectCommitHeadStmt = db.query(`
    SELECT commit_id, sequence_no
    FROM cardinal_commits
    WHERE project_id = ?1
    ORDER BY sequence_no DESC
    LIMIT 1
  `)

  const insertCommitStmt = db.query(`
    INSERT INTO cardinal_commits (
      commit_id,
      project_id,
      parent_commit_id,
      sequence_no,
      started_at_ns,
      ended_at_ns,
      event_cursor_start,
      event_cursor_end,
      change_count,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `)

  const insertCommitEntryStmt = db.query(`
    INSERT INTO cardinal_commit_entries (
      commit_id,
      project_id,
      ended_at_ns,
      rel_path,
      op,
      old_rel_path,
      before_json,
      after_json,
      blob_before,
      blob_after,
      content_hash_before,
      content_hash_after
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  `)

  const updateProjectCursorStmt = db.query(`
    UPDATE cardinal_projects
    SET last_event_cursor = ?2, updated_at = ?3
    WHERE project_id = ?1
  `)

  const insertMetricStmt = db.query(`
    INSERT INTO cardinal_metrics (
      project_id,
      metric_name,
      metric_value,
      meta_json,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5)
  `)

  const selectLatestHeartbeatStmt = db.query(`
    SELECT
      created_at,
      meta_json
    FROM cardinal_metrics
    WHERE metric_name = 'heartbeat'
    ORDER BY metric_id DESC
    LIMIT 1
  `)

  const selectCommitsStmt = db.query(`
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
      AND (?2 IS NULL OR ended_at_ns >= ?2)
      AND (?3 IS NULL OR ended_at_ns <= ?3)
    ORDER BY sequence_no DESC
    LIMIT ?4
  `)

  const selectCommitsBySequenceRangeStmt = db.query(`
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

  const selectCommitByIdStmt = db.query(`
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

  const selectCommitEntriesStmt = db.query(`
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

  const selectFileHistoryStmt = db.query(`
    SELECT
      ce.commit_id,
      ce.rel_path,
      ce.op,
      ce.old_rel_path,
      ce.before_json,
      ce.after_json,
      ce.blob_before,
      ce.blob_after,
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

  const replaceIndex = (projectId: string, index: Map<string, IndexEntry>): void => {
    // Index snapshots are replaced atomically within surrounding transactions.
    clearProjectIndexStmt.run(projectId)
    for (const entry of index.values()) {
      insertIndexEntryStmt.run(
        projectId,
        entry.relPath,
        entry.kind,
        entry.size,
        entry.mtimeNs,
        entry.inode,
        entry.device,
        entry.modeBits,
        entry.hash,
        entry.symlinkTarget,
      )
    }
  }

  logger.log({
    event: 'cardinal.store.db.initialize',
    fields: {
      duration_ms: Date.now() - initializeStartedAt,
    },
  })

  const runStore = <T>(
    event: string,
    fields: WideEventObject,
    fn: () => T,
    level: 'debug' | 'info' = 'info',
  ): T =>
    logger.run(
      {
        event,
        fields,
        level,
      },
      fn,
    )

  return {
    listProjects: (): ProjectConfig[] =>
      runStore(
        'cardinal.store.projects.list',
        {},
        () =>
          (selectProjectsStmt.all() as Array<JsonObject>)
            .map((row) => toProjectConfig(row))
            .filter((row): row is ProjectConfig => row !== null),
        'debug',
      ),

    getProjectById: (projectId: string): ProjectConfig | null =>
      runStore(
        'cardinal.store.project.get_by_id',
        {
          project_id: projectId,
        },
        () => toProjectConfig(selectProjectByIdStmt.get(projectId) as JsonValue),
        'debug',
      ),

    getProjectByRootPath: (rootPath: string): ProjectConfig | null =>
      runStore(
        'cardinal.store.project.get_by_root',
        {
          root_path: rootPath,
        },
        () => toProjectConfig(selectProjectByRootPathStmt.get(rootPath) as JsonValue),
        'debug',
      ),

    addProject: (input: {
      name: string
      rootPath: string
      mode: ProjectMode
      hashPolicy: HashPolicy
      ignoreRules: string[]
    }): ProjectConfig =>
      runStore(
        'cardinal.store.project.add',
        {
          name: input.name,
          root_path: input.rootPath,
          mode: input.mode,
          hash_policy: input.hashPolicy,
          ignore_rule_count: input.ignoreRules.length,
        },
        () => {
          const now = new Date().toISOString()
          const projectId = randomUUID()

          insertProjectStmt.run(
            projectId,
            input.name,
            input.rootPath,
            1,
            JSON.stringify(
              input.ignoreRules.length > 0 ? input.ignoreRules : DEFAULT_IGNORE_PATTERNS,
            ),
            input.mode,
            input.hashPolicy,
            DEFAULT_MAX_BLOB_SIZE_BYTES,
            DEFAULT_DEBOUNCE_MS,
            DEFAULT_COMMIT_IDLE_MS,
            DEFAULT_COMMIT_MAX_INTERVAL_MS,
            null,
            now,
            now,
          )

          const created = toProjectConfig(selectProjectByIdStmt.get(projectId) as JsonValue)
          if (!created) {
            throw new Error('Failed to create project')
          }

          return created
        },
        'debug',
      ),

    removeProject: (projectId: string): void =>
      runStore(
        'cardinal.store.project.remove',
        {
          project_id: projectId,
        },
        () => {
          removeProjectStmt.run(projectId)
        },
        'debug',
      ),

    readIndex: (projectId: string): Map<string, IndexEntry> =>
      runStore(
        'cardinal.store.index.read',
        {
          project_id: projectId,
        },
        () => {
          const rows = selectProjectIndexStmt.all(projectId) as Array<JsonObject>
          const index = new Map<string, IndexEntry>()

          for (const row of rows) {
            const relPath = asString(row.rel_path)
            const kind = asString(row.kind)
            if (!relPath || !kind) {
              continue
            }

            index.set(relPath, {
              relPath,
              kind: kind === 'dir' || kind === 'symlink' ? kind : 'file',
              size: asNumber(row.size) ?? 0,
              mtimeNs: asNumber(row.mtime_ns) ?? 0,
              inode: asNumber(row.inode) ?? 0,
              device: asNumber(row.device) ?? 0,
              modeBits: asNumber(row.mode_bits),
              hash: asString(row.hash),
              symlinkTarget: asString(row.symlink_target),
            })
          }

          return index
        },
        'debug',
      ),

    writeCommit: (input: {
      projectId: string
      startedAtNs: number
      endedAtNs: number
      eventCursorStart: string | null
      eventCursorEnd: string | null
      changes: ChangedEntry[]
      nextIndex: Map<string, IndexEntry>
    }): CommitRecord | null =>
      runStore(
        'cardinal.store.commit.write',
        {
          project_id: input.projectId,
          started_at_ns: input.startedAtNs,
          ended_at_ns: input.endedAtNs,
          change_count: input.changes.length,
          next_index_size: input.nextIndex.size,
          event_cursor_start: input.eventCursorStart,
          event_cursor_end: input.eventCursorEnd,
        },
        () => {
          if (input.changes.length === 0) {
            return null
          }

          const head = selectCommitHeadStmt.get(input.projectId) as JsonObject | null
          const parentCommitId = head ? asString(head.commit_id) : null
          const previousSequence = head ? (asNumber(head.sequence_no) ?? 0) : 0
          const sequenceNo = previousSequence + 1
          const commitId = randomUUID()
          const now = new Date().toISOString()

          const txn = db.transaction(() => {
            insertCommitStmt.run(
              commitId,
              input.projectId,
              parentCommitId,
              sequenceNo,
              input.startedAtNs,
              input.endedAtNs,
              input.eventCursorStart,
              input.eventCursorEnd,
              input.changes.length,
              now,
            )

            for (const entry of input.changes) {
              insertCommitEntryStmt.run(
                commitId,
                input.projectId,
                input.endedAtNs,
                entry.relPath,
                entry.op,
                entry.oldRelPath,
                entry.before ? JSON.stringify(entry.before) : null,
                entry.after ? JSON.stringify(entry.after) : null,
                entry.blobBefore,
                entry.blobAfter,
                entry.blobBefore,
                entry.blobAfter,
              )
            }

            replaceIndex(input.projectId, input.nextIndex)
            updateProjectCursorStmt.run(input.projectId, input.eventCursorEnd, now)
          })

          txn()

          return {
            commitId,
            projectId: input.projectId,
            parentCommitId,
            sequenceNo,
            startedAtNs: input.startedAtNs,
            endedAtNs: input.endedAtNs,
            eventCursorStart: input.eventCursorStart,
            eventCursorEnd: input.eventCursorEnd,
            changeCount: input.changes.length,
          }
        },
        'debug',
      ),

    setProjectIndexSnapshot: (args: {
      projectId: string
      index: Map<string, IndexEntry>
      cursor: string | null
    }): void =>
      runStore(
        'cardinal.store.index.snapshot.set',
        {
          project_id: args.projectId,
          index_size: args.index.size,
          cursor: args.cursor,
        },
        () => {
          const now = new Date().toISOString()
          const txn = db.transaction(() => {
            replaceIndex(args.projectId, args.index)
            updateProjectCursorStmt.run(args.projectId, args.cursor, now)
          })

          txn()
        },
        'debug',
      ),

    touchProjectCursor: (projectId: string, cursor: string | null): void =>
      runStore(
        'cardinal.store.project.cursor.touch',
        {
          project_id: projectId,
          cursor,
        },
        () => {
          updateProjectCursorStmt.run(projectId, cursor, new Date().toISOString())
        },
        'debug',
      ),

    recordProjectMetrics: (args: {
      projectId: string
      queueDepth: number
      scanStats: ScanStats
      changes: number
    }): void =>
      runStore(
        'cardinal.store.metrics.project.record',
        {
          project_id: args.projectId,
          queue_depth: args.queueDepth,
          files_scanned: args.scanStats.filesScanned,
          directories_scanned: args.scanStats.directoriesScanned,
          scan_duration_ms: args.scanStats.elapsedMs,
          changes: args.changes,
        },
        () => {
          const now = new Date().toISOString()
          const metrics: Array<{ name: string; value: number; meta?: JsonObject }> = [
            { name: 'queue_depth', value: args.queueDepth },
            { name: 'files_scanned', value: args.scanStats.filesScanned },
            { name: 'directories_scanned', value: args.scanStats.directoriesScanned },
            { name: 'scan_duration_ms', value: args.scanStats.elapsedMs },
            { name: 'changes_detected', value: args.changes },
          ]

          const txn = db.transaction(() => {
            for (const metric of metrics) {
              insertMetricStmt.run(
                args.projectId,
                metric.name,
                metric.value,
                metric.meta ? JSON.stringify(metric.meta) : null,
                now,
              )
            }
          })

          txn()
        },
        'debug',
      ),

    recordHeartbeat: (args: { projectCount: number; agentPid: number }): void =>
      runStore(
        'cardinal.store.metrics.heartbeat.record',
        {
          project_count: args.projectCount,
          agent_pid: args.agentPid,
        },
        () => {
          insertMetricStmt.run(
            null,
            'heartbeat',
            1,
            JSON.stringify({ projectCount: args.projectCount, agentPid: args.agentPid }),
            new Date().toISOString(),
          )
        },
      ),

    getLatestHeartbeat: (): HeartbeatRow | null =>
      runStore(
        'cardinal.store.metrics.heartbeat.get_latest',
        {},
        () => {
          const row = selectLatestHeartbeatStmt.get() as JsonObject | null
          if (!row) {
            return null
          }

          let projectCount: number | null = null
          let agentPid: number | null = null
          try {
            const metaRaw = asString(row.meta_json)
            if (metaRaw) {
              const meta = JSON.parse(metaRaw) as JsonObject
              projectCount = asNumber(meta.projectCount)
              agentPid = asNumber(meta.agentPid)
            }
          } catch {
            projectCount = null
            agentPid = null
          }

          const createdAt = asString(row.created_at)
          if (!createdAt) {
            return null
          }

          return {
            createdAt,
            projectCount,
            agentPid,
          }
        },
        'debug',
      ),

    listCommits: (args: {
      projectId: string
      sinceNs?: number
      untilNs?: number
      limit?: number
    }): CommitRecord[] =>
      runStore(
        'cardinal.store.commits.list',
        {
          project_id: args.projectId,
          since_ns: args.sinceNs ?? null,
          until_ns: args.untilNs ?? null,
          limit: args.limit ?? 100,
        },
        () => {
          const rows = selectCommitsStmt.all(
            args.projectId,
            args.sinceNs ?? null,
            args.untilNs ?? null,
            Math.max(1, Math.min(args.limit ?? 100, 1000)),
          ) as Array<JsonObject>

          return rows
            .map((row) => toCommitRecord(row))
            .filter((row): row is CommitRecord => row !== null)
        },
        'debug',
      ),

    listCommitsBySequenceRange: (args: {
      projectId: string
      fromSequence: number
      toSequence: number
    }): CommitRecord[] =>
      runStore(
        'cardinal.store.commits.list_by_sequence_range',
        {
          project_id: args.projectId,
          from_sequence: args.fromSequence,
          to_sequence: args.toSequence,
        },
        () => {
          const rows = selectCommitsBySequenceRangeStmt.all(
            args.projectId,
            Math.min(args.fromSequence, args.toSequence),
            Math.max(args.fromSequence, args.toSequence),
          ) as Array<JsonObject>
          return rows
            .map((row) => toCommitRecord(row))
            .filter((row): row is CommitRecord => row !== null)
        },
        'debug',
      ),

    getCommit: (commitId: string): CommitRecord | null =>
      runStore(
        'cardinal.store.commit.get',
        {
          commit_id: commitId,
        },
        () => toCommitRecord(selectCommitByIdStmt.get(commitId) as JsonValue),
        'debug',
      ),

    getCommitEntries: (commitId: string): CommitEntryRow[] =>
      runStore(
        'cardinal.store.commit.entries.list',
        {
          commit_id: commitId,
        },
        () =>
          (selectCommitEntriesStmt.all(commitId) as Array<JsonObject>).map((row) => ({
            relPath: asString(row.rel_path) || '',
            op: asString(row.op) || '',
            oldRelPath: asString(row.old_rel_path),
            beforeJson: asString(row.before_json),
            afterJson: asString(row.after_json),
            blobBefore: asString(row.blob_before) || asString(row.content_hash_before),
            blobAfter: asString(row.blob_after) || asString(row.content_hash_after),
          })),
        'debug',
      ),

    getFileHistory: (args: {
      projectId: string
      relPath: string
      limit?: number
    }): Array<JsonObject> =>
      runStore(
        'cardinal.store.file_history.list',
        {
          project_id: args.projectId,
          rel_path: args.relPath,
          limit: args.limit ?? 100,
        },
        () =>
          selectFileHistoryStmt.all(
            args.projectId,
            args.relPath,
            Math.max(1, Math.min(args.limit ?? 100, 1000)),
          ) as Array<JsonObject>,
        'debug',
      ),
  }
}
