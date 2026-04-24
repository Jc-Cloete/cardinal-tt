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
  ActivityHeartbeatRow,
  ActivityScreenshotAsset,
  ActivityScreenshotFrame,
  ActivityWindowEvent,
  ChangedEntry,
  CommitEntryRow,
  CommitRecord,
  HashPolicy,
  HeartbeatRow,
  IndexEntry,
  JiraCachedIssue,
  JiraCachedProject,
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

const toJiraCachedProject = (value: JsonValue): JiraCachedProject | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const jiraProjectId = asString(row.jira_project_id)
  const projectKey = asString(row.project_key)
  const name = asString(row.name)
  const rawJson = asString(row.raw_json)
  const cachedAt = asString(row.cached_at)
  if (!jiraProjectId || !projectKey || !name || !rawJson || !cachedAt) {
    return null
  }

  return {
    jiraProjectId,
    projectKey,
    name,
    projectType: asString(row.project_type),
    leadDisplayName: asString(row.lead_display_name),
    avatarUrl: asString(row.avatar_url),
    rawJson,
    cachedAt,
  }
}

const toJiraCachedIssue = (value: JsonValue): JiraCachedIssue | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const jiraIssueId = asString(row.jira_issue_id)
  const issueKey = asString(row.issue_key)
  const projectKey = asString(row.project_key)
  const summary = asString(row.summary)
  const rawJson = asString(row.raw_json)
  const cachedAt = asString(row.cached_at)
  if (!jiraIssueId || !issueKey || !projectKey || !summary || !rawJson || !cachedAt) {
    return null
  }

  return {
    jiraIssueId,
    issueKey,
    projectKey,
    summary,
    statusId: asString(row.status_id),
    statusName: asString(row.status_name),
    issueType: asString(row.issue_type),
    assigneeDisplayName: asString(row.assignee_display_name),
    priorityName: asString(row.priority_name),
    updatedAt: asString(row.updated_at),
    rawJson,
    cachedAt,
  }
}

const toActivityWindowEvent = (value: JsonValue): ActivityWindowEvent | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const eventId = asString(row.event_id)
  const observedAt = asString(row.observed_at)
  const appName = asString(row.app_name)
  const windowTitle = asString(row.window_title)
  if (!eventId || !observedAt || !appName || windowTitle === null) {
    return null
  }

  return {
    eventId,
    observedAt,
    appName,
    windowTitle,
    bundleId: asString(row.bundle_id),
    ownerPid: asNumber(row.owner_pid),
  }
}

const toActivityScreenshotAsset = (value: JsonValue): ActivityScreenshotAsset | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const assetId = asString(row.asset_id)
  const sha256 = asString(row.sha256)
  const storagePath = asString(row.storage_path)
  const createdAt = asString(row.created_at)
  const bytes = asNumber(row.bytes)
  if (!assetId || !sha256 || !storagePath || !createdAt || bytes === null) {
    return null
  }

  return {
    assetId,
    sha256,
    storagePath,
    bytes,
    width: asNumber(row.width),
    height: asNumber(row.height),
    createdAt,
  }
}

const toActivityScreenshotFrame = (value: JsonValue): ActivityScreenshotFrame | null => {
  const row = value as JsonObject | null
  if (!row) {
    return null
  }

  const frameId = asString(row.frame_id)
  const observedAt = asString(row.observed_at)
  const assetId = asString(row.asset_id)
  if (!frameId || !observedAt || !assetId) {
    return null
  }

  return {
    frameId,
    observedAt,
    assetId,
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
  reprocessProject: (args: {
    projectId: string
    index: Map<string, IndexEntry>
    cursor: string | null
  }) => void
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
  recordActivityHeartbeat: (args: { agentPid: number }) => void
  getLatestActivityHeartbeat: () => ActivityHeartbeatRow | null
  insertActivityWindowEvent: (event: ActivityWindowEvent) => void
  listActivityWindowEvents: (args: {
    fromIso: string
    toIso: string
    limit?: number
  }) => ActivityWindowEvent[]
  upsertActivityScreenshotAsset: (asset: ActivityScreenshotAsset) => void
  getActivityScreenshotAssetById: (assetId: string) => ActivityScreenshotAsset | null
  insertActivityScreenshotFrame: (frame: ActivityScreenshotFrame) => void
  listActivityScreenshotFrames: (args: {
    fromIso: string
    toIso: string
    limit?: number
  }) => ActivityScreenshotFrame[]
  listJiraProjects: () => JiraCachedProject[]
  replaceJiraProjects: (args: { projects: JiraCachedProject[]; syncedAt: string }) => void
  listJiraIssues: (projectKey: string) => JiraCachedIssue[]
  listJiraIssueStatusOptions: () => string[]
  listJiraIssueAssigneeOptions: () => string[]
  replaceJiraIssues: (args: {
    projectKey: string
    issues: JiraCachedIssue[]
    syncedAt: string
  }) => void
  upsertJiraIssue: (issue: JiraCachedIssue) => void
  getJiraSyncAt: (syncKey: string) => string | null
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

    CREATE TABLE IF NOT EXISTS jira_projects (
      jira_project_id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      project_type TEXT,
      lead_display_name TEXT,
      avatar_url TEXT,
      raw_json TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jira_issues (
      jira_issue_id TEXT PRIMARY KEY,
      issue_key TEXT NOT NULL UNIQUE,
      project_key TEXT NOT NULL,
      summary TEXT NOT NULL,
      status_id TEXT,
      status_name TEXT,
      issue_type TEXT,
      assignee_display_name TEXT,
      priority_name TEXT,
      updated_at TEXT,
      raw_json TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jira_sync_state (
      sync_key TEXT PRIMARY KEY,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_window_events (
      event_id TEXT PRIMARY KEY,
      observed_at TEXT NOT NULL,
      app_name TEXT NOT NULL,
      window_title TEXT NOT NULL,
      bundle_id TEXT,
      owner_pid INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_screenshot_assets (
      asset_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      storage_path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_screenshot_frames (
      frame_id TEXT PRIMARY KEY,
      observed_at TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES activity_screenshot_assets(asset_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_cardinal_commits_project_time ON cardinal_commits(project_id, ended_at_ns);
    CREATE INDEX IF NOT EXISTS idx_cardinal_metrics_project_time ON cardinal_metrics(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_jira_issues_project_key ON jira_issues(project_key);
    CREATE INDEX IF NOT EXISTS idx_jira_issues_updated_at ON jira_issues(updated_at);
    CREATE INDEX IF NOT EXISTS idx_activity_window_events_observed_at ON activity_window_events(observed_at);
    CREATE INDEX IF NOT EXISTS idx_activity_screenshot_frames_observed_at ON activity_screenshot_frames(observed_at);
    CREATE INDEX IF NOT EXISTS idx_activity_screenshot_frames_asset_id ON activity_screenshot_frames(asset_id);
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
  const clearProjectCommitsStmt = db.query(`DELETE FROM cardinal_commits WHERE project_id = ?1`)
  const clearProjectCommitEntriesStmt = db.query(
    `DELETE FROM cardinal_commit_entries WHERE project_id = ?1`,
  )
  const clearProjectMetricsStmt = db.query(`DELETE FROM cardinal_metrics WHERE project_id = ?1`)

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

  const insertActivityWindowEventStmt = db.query(`
    INSERT OR IGNORE INTO activity_window_events (
      event_id,
      observed_at,
      app_name,
      window_title,
      bundle_id,
      owner_pid,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `)

  const selectActivityWindowEventsStmt = db.query(`
    SELECT
      event_id,
      observed_at,
      app_name,
      window_title,
      bundle_id,
      owner_pid
    FROM activity_window_events
    WHERE observed_at >= ?1
      AND observed_at <= ?2
    ORDER BY observed_at ASC
    LIMIT ?3
  `)

  const upsertActivityScreenshotAssetStmt = db.query(`
    INSERT INTO activity_screenshot_assets (
      asset_id,
      sha256,
      storage_path,
      bytes,
      width,
      height,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(asset_id) DO UPDATE SET
      sha256=excluded.sha256,
      storage_path=excluded.storage_path,
      bytes=excluded.bytes,
      width=excluded.width,
      height=excluded.height,
      created_at=excluded.created_at
  `)

  const selectActivityScreenshotAssetByIdStmt = db.query(`
    SELECT
      asset_id,
      sha256,
      storage_path,
      bytes,
      width,
      height,
      created_at
    FROM activity_screenshot_assets
    WHERE asset_id = ?1
    LIMIT 1
  `)

  const insertActivityScreenshotFrameStmt = db.query(`
    INSERT OR IGNORE INTO activity_screenshot_frames (
      frame_id,
      observed_at,
      asset_id,
      created_at
    ) VALUES (?1, ?2, ?3, ?4)
  `)

  const selectActivityScreenshotFramesStmt = db.query(`
    SELECT
      frame_id,
      observed_at,
      asset_id
    FROM activity_screenshot_frames
    WHERE observed_at >= ?1
      AND observed_at <= ?2
    ORDER BY observed_at ASC
    LIMIT ?3
  `)

  const selectLatestActivityHeartbeatStmt = db.query(`
    SELECT
      created_at,
      meta_json
    FROM cardinal_metrics
    WHERE metric_name = 'activity_heartbeat'
    ORDER BY metric_id DESC
    LIMIT 1
  `)

  const deleteAllJiraProjectsStmt = db.query(`DELETE FROM jira_projects`)
  const insertJiraProjectStmt = db.query(`
    INSERT INTO jira_projects (
      jira_project_id,
      project_key,
      name,
      project_type,
      lead_display_name,
      avatar_url,
      raw_json,
      cached_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(jira_project_id) DO UPDATE SET
      project_key=excluded.project_key,
      name=excluded.name,
      project_type=excluded.project_type,
      lead_display_name=excluded.lead_display_name,
      avatar_url=excluded.avatar_url,
      raw_json=excluded.raw_json,
      cached_at=excluded.cached_at
  `)

  const selectJiraProjectsStmt = db.query(`
    SELECT
      jira_project_id,
      project_key,
      name,
      project_type,
      lead_display_name,
      avatar_url,
      raw_json,
      cached_at
    FROM jira_projects
    ORDER BY lower(project_key) ASC
  `)

  const deleteJiraIssuesByProjectStmt = db.query(`DELETE FROM jira_issues WHERE project_key = ?1`)
  const insertJiraIssueStmt = db.query(`
    INSERT INTO jira_issues (
      jira_issue_id,
      issue_key,
      project_key,
      summary,
      status_id,
      status_name,
      issue_type,
      assignee_display_name,
      priority_name,
      updated_at,
      raw_json,
      cached_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT(jira_issue_id) DO UPDATE SET
      issue_key=excluded.issue_key,
      project_key=excluded.project_key,
      summary=excluded.summary,
      status_id=excluded.status_id,
      status_name=excluded.status_name,
      issue_type=excluded.issue_type,
      assignee_display_name=excluded.assignee_display_name,
      priority_name=excluded.priority_name,
      updated_at=excluded.updated_at,
      raw_json=excluded.raw_json,
      cached_at=excluded.cached_at
  `)

  const selectJiraIssuesByProjectStmt = db.query(`
    SELECT
      jira_issue_id,
      issue_key,
      project_key,
      summary,
      status_id,
      status_name,
      issue_type,
      assignee_display_name,
      priority_name,
      updated_at,
      raw_json,
      cached_at
    FROM jira_issues
    WHERE project_key = ?1
    ORDER BY issue_key ASC
  `)

  const selectJiraIssueStatusOptionsStmt = db.query(`
    SELECT DISTINCT status_name
    FROM jira_issues
    WHERE status_name IS NOT NULL AND trim(status_name) <> ''
    ORDER BY lower(status_name) ASC
  `)

  const selectJiraIssueAssigneeOptionsStmt = db.query(`
    SELECT DISTINCT assignee_display_name
    FROM jira_issues
    WHERE assignee_display_name IS NOT NULL AND trim(assignee_display_name) <> ''
    ORDER BY lower(assignee_display_name) ASC
  `)

  const upsertJiraSyncStateStmt = db.query(`
    INSERT INTO jira_sync_state (sync_key, synced_at)
    VALUES (?1, ?2)
    ON CONFLICT(sync_key) DO UPDATE SET synced_at=excluded.synced_at
  `)

  const selectJiraSyncStateStmt = db.query(`
    SELECT synced_at
    FROM jira_sync_state
    WHERE sync_key = ?1
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

    reprocessProject: (args: {
      projectId: string
      index: Map<string, IndexEntry>
      cursor: string | null
    }): void =>
      runStore(
        'cardinal.store.project.reprocess',
        {
          project_id: args.projectId,
          index_size: args.index.size,
          cursor: args.cursor,
        },
        () => {
          const now = new Date().toISOString()
          const txn = db.transaction(() => {
            clearProjectCommitEntriesStmt.run(args.projectId)
            clearProjectCommitsStmt.run(args.projectId)
            clearProjectMetricsStmt.run(args.projectId)
            replaceIndex(args.projectId, args.index)
            updateProjectCursorStmt.run(args.projectId, args.cursor, now)
          })

          txn()
        },
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

    recordActivityHeartbeat: (args: { agentPid: number }): void =>
      runStore(
        'cardinal.store.metrics.activity_heartbeat.record',
        {
          agent_pid: args.agentPid,
        },
        () => {
          insertMetricStmt.run(
            null,
            'activity_heartbeat',
            1,
            JSON.stringify({ agentPid: args.agentPid }),
            new Date().toISOString(),
          )
        },
      ),

    getLatestActivityHeartbeat: (): ActivityHeartbeatRow | null =>
      runStore(
        'cardinal.store.metrics.activity_heartbeat.get_latest',
        {},
        () => {
          const row = selectLatestActivityHeartbeatStmt.get() as JsonObject | null
          if (!row) {
            return null
          }

          let agentPid: number | null = null
          try {
            const metaRaw = asString(row.meta_json)
            if (metaRaw) {
              const meta = JSON.parse(metaRaw) as JsonObject
              agentPid = asNumber(meta.agentPid)
            }
          } catch {
            agentPid = null
          }

          const createdAt = asString(row.created_at)
          if (!createdAt) {
            return null
          }

          return {
            createdAt,
            agentPid,
          }
        },
        'debug',
      ),

    insertActivityWindowEvent: (event: ActivityWindowEvent): void =>
      runStore(
        'cardinal.store.activity.window_event.insert',
        {
          event_id: event.eventId,
          observed_at: event.observedAt,
          app_name: event.appName,
          owner_pid: event.ownerPid,
        },
        () => {
          insertActivityWindowEventStmt.run(
            event.eventId,
            event.observedAt,
            event.appName,
            event.windowTitle,
            event.bundleId,
            event.ownerPid,
            new Date().toISOString(),
          )
        },
        'debug',
      ),

    listActivityWindowEvents: (args: {
      fromIso: string
      toIso: string
      limit?: number
    }): ActivityWindowEvent[] =>
      runStore(
        'cardinal.store.activity.window_events.list',
        {
          from_iso: args.fromIso,
          to_iso: args.toIso,
          limit: args.limit ?? 1000,
        },
        () => {
          const rows = selectActivityWindowEventsStmt.all(
            args.fromIso,
            args.toIso,
            Math.max(1, Math.min(args.limit ?? 1000, 10_000)),
          ) as Array<JsonObject>

          return rows
            .map((row) => toActivityWindowEvent(row))
            .filter((row): row is ActivityWindowEvent => row !== null)
        },
        'debug',
      ),

    upsertActivityScreenshotAsset: (asset: ActivityScreenshotAsset): void =>
      runStore(
        'cardinal.store.activity.screenshot_asset.upsert',
        {
          asset_id: asset.assetId,
          sha256: asset.sha256,
          bytes: asset.bytes,
        },
        () => {
          upsertActivityScreenshotAssetStmt.run(
            asset.assetId,
            asset.sha256,
            asset.storagePath,
            asset.bytes,
            asset.width,
            asset.height,
            asset.createdAt,
          )
        },
        'debug',
      ),

    getActivityScreenshotAssetById: (assetId: string): ActivityScreenshotAsset | null =>
      runStore(
        'cardinal.store.activity.screenshot_asset.get',
        {
          asset_id: assetId,
        },
        () =>
          toActivityScreenshotAsset(
            selectActivityScreenshotAssetByIdStmt.get(assetId) as JsonValue,
          ),
        'debug',
      ),

    insertActivityScreenshotFrame: (frame: ActivityScreenshotFrame): void =>
      runStore(
        'cardinal.store.activity.screenshot_frame.insert',
        {
          frame_id: frame.frameId,
          observed_at: frame.observedAt,
          asset_id: frame.assetId,
        },
        () => {
          insertActivityScreenshotFrameStmt.run(
            frame.frameId,
            frame.observedAt,
            frame.assetId,
            new Date().toISOString(),
          )
        },
        'debug',
      ),

    listActivityScreenshotFrames: (args: {
      fromIso: string
      toIso: string
      limit?: number
    }): ActivityScreenshotFrame[] =>
      runStore(
        'cardinal.store.activity.screenshot_frames.list',
        {
          from_iso: args.fromIso,
          to_iso: args.toIso,
          limit: args.limit ?? 1000,
        },
        () => {
          const rows = selectActivityScreenshotFramesStmt.all(
            args.fromIso,
            args.toIso,
            Math.max(1, Math.min(args.limit ?? 1000, 10_000)),
          ) as Array<JsonObject>
          return rows
            .map((row) => toActivityScreenshotFrame(row))
            .filter((row): row is ActivityScreenshotFrame => row !== null)
        },
        'debug',
      ),

    listJiraProjects: (): JiraCachedProject[] =>
      runStore(
        'cardinal.store.jira.projects.list',
        {},
        () =>
          (selectJiraProjectsStmt.all() as Array<JsonObject>)
            .map((row) => toJiraCachedProject(row))
            .filter((row): row is JiraCachedProject => row !== null),
        'debug',
      ),

    replaceJiraProjects: (args: { projects: JiraCachedProject[]; syncedAt: string }): void =>
      runStore(
        'cardinal.store.jira.projects.replace',
        {
          project_count: args.projects.length,
          synced_at: args.syncedAt,
        },
        () => {
          const tx = db.transaction(() => {
            deleteAllJiraProjectsStmt.run()
            for (const project of args.projects) {
              insertJiraProjectStmt.run(
                project.jiraProjectId,
                project.projectKey,
                project.name,
                project.projectType,
                project.leadDisplayName,
                project.avatarUrl,
                project.rawJson,
                project.cachedAt,
              )
            }
            upsertJiraSyncStateStmt.run('projects', args.syncedAt)
          })
          tx()
        },
        'debug',
      ),

    listJiraIssues: (projectKey: string): JiraCachedIssue[] =>
      runStore(
        'cardinal.store.jira.issues.list',
        {
          project_key: projectKey,
        },
        () =>
          (selectJiraIssuesByProjectStmt.all(projectKey) as Array<JsonObject>)
            .map((row) => toJiraCachedIssue(row))
            .filter((row): row is JiraCachedIssue => row !== null),
        'debug',
      ),

    listJiraIssueStatusOptions: (): string[] =>
      runStore(
        'cardinal.store.jira.issues.status_options.list',
        {},
        () =>
          (selectJiraIssueStatusOptionsStmt.all() as Array<JsonObject>)
            .map((row) => asString(row.status_name))
            .filter((value): value is string => Boolean(value))
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        'debug',
      ),

    listJiraIssueAssigneeOptions: (): string[] =>
      runStore(
        'cardinal.store.jira.issues.assignee_options.list',
        {},
        () =>
          (selectJiraIssueAssigneeOptionsStmt.all() as Array<JsonObject>)
            .map((row) => asString(row.assignee_display_name))
            .filter((value): value is string => Boolean(value))
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        'debug',
      ),

    replaceJiraIssues: (args: {
      projectKey: string
      issues: JiraCachedIssue[]
      syncedAt: string
    }): void =>
      runStore(
        'cardinal.store.jira.issues.replace',
        {
          project_key: args.projectKey,
          issue_count: args.issues.length,
          synced_at: args.syncedAt,
        },
        () => {
          const tx = db.transaction(() => {
            deleteJiraIssuesByProjectStmt.run(args.projectKey)
            for (const issue of args.issues) {
              insertJiraIssueStmt.run(
                issue.jiraIssueId,
                issue.issueKey,
                issue.projectKey,
                issue.summary,
                issue.statusId,
                issue.statusName,
                issue.issueType,
                issue.assigneeDisplayName,
                issue.priorityName,
                issue.updatedAt,
                issue.rawJson,
                issue.cachedAt,
              )
            }
            upsertJiraSyncStateStmt.run(`issues:${args.projectKey}`, args.syncedAt)
          })
          tx()
        },
        'debug',
      ),

    upsertJiraIssue: (issue: JiraCachedIssue): void =>
      runStore(
        'cardinal.store.jira.issue.upsert',
        {
          issue_key: issue.issueKey,
          project_key: issue.projectKey,
          status_name: issue.statusName,
        },
        () => {
          insertJiraIssueStmt.run(
            issue.jiraIssueId,
            issue.issueKey,
            issue.projectKey,
            issue.summary,
            issue.statusId,
            issue.statusName,
            issue.issueType,
            issue.assigneeDisplayName,
            issue.priorityName,
            issue.updatedAt,
            issue.rawJson,
            issue.cachedAt,
          )
        },
        'debug',
      ),

    getJiraSyncAt: (syncKey: string): string | null =>
      runStore(
        'cardinal.store.jira.sync.get',
        {
          sync_key: syncKey,
        },
        () => {
          const row = selectJiraSyncStateStmt.get(syncKey) as JsonObject | null
          return row ? asString(row.synced_at) : null
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
