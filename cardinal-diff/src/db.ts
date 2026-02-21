import { createCardinalStore } from 'cardinal-store'
import { diffLogger } from './observability'
import { cacheDbPath, ensureDirectories } from './paths'
import type {
  ChangedEntry,
  CommitEntryRow,
  CommitRecord,
  HashPolicy,
  HeartbeatRow,
  IndexEntry,
  JsonObject,
  ProjectConfig,
  ProjectMode,
  ScanStats,
} from './types'

export type { CommitEntryRow }

const logger = diffLogger.child({
  component: 'db-adapter',
  db_path: cacheDbPath,
})

ensureDirectories()

logger.log({
  event: 'cardinal.diff.directories.ensure',
  fields: {
    cache_db_path: cacheDbPath,
  },
})

// Shared store instance ensures the agent + CLI operate against one schema contract.
const store = createCardinalStore(cacheDbPath)

const runDb = <T>(
  event: string,
  fields: JsonObject,
  fn: () => T,
  level: 'debug' | 'info' = 'debug',
): T =>
  logger.run(
    {
      event,
      fields,
      level,
    },
    fn,
  )

export const listProjects = (): ProjectConfig[] =>
  runDb('cardinal.diff.db.projects.list', {}, () => store.listProjects())

export const getProjectById = (projectId: string): ProjectConfig | null =>
  runDb(
    'cardinal.diff.db.project.get_by_id',
    {
      project_id: projectId,
    },
    () => store.getProjectById(projectId),
  )

export const getProjectByRootPath = (rootPath: string): ProjectConfig | null =>
  runDb(
    'cardinal.diff.db.project.get_by_root',
    {
      root_path: rootPath,
    },
    () => store.getProjectByRootPath(rootPath),
  )

export const addProject = (input: {
  name: string
  rootPath: string
  mode: ProjectMode
  hashPolicy: HashPolicy
  ignoreRules: string[]
}): ProjectConfig =>
  runDb(
    'cardinal.diff.db.project.add',
    {
      name: input.name,
      root_path: input.rootPath,
      mode: input.mode,
      hash_policy: input.hashPolicy,
      ignore_rule_count: input.ignoreRules.length,
    },
    () => store.addProject(input),
  )

export const removeProject = (projectId: string): void =>
  runDb(
    'cardinal.diff.db.project.remove',
    {
      project_id: projectId,
    },
    () => store.removeProject(projectId),
  )

export const reprocessProject = (args: {
  projectId: string
  index: Map<string, IndexEntry>
  cursor: string | null
}): void =>
  runDb(
    'cardinal.diff.db.project.reprocess',
    {
      project_id: args.projectId,
      index_size: args.index.size,
      cursor: args.cursor,
    },
    () => store.reprocessProject(args),
    'info',
  )

export const readIndex = (projectId: string): Map<string, IndexEntry> =>
  runDb(
    'cardinal.diff.db.index.read',
    {
      project_id: projectId,
    },
    () => store.readIndex(projectId),
  )

export const writeCommit = (input: {
  projectId: string
  startedAtNs: number
  endedAtNs: number
  eventCursorStart: string | null
  eventCursorEnd: string | null
  changes: ChangedEntry[]
  nextIndex: Map<string, IndexEntry>
}): CommitRecord | null =>
  runDb(
    'cardinal.diff.db.commit.write',
    {
      project_id: input.projectId,
      started_at_ns: input.startedAtNs,
      ended_at_ns: input.endedAtNs,
      change_count: input.changes.length,
      next_index_size: input.nextIndex.size,
      event_cursor_start: input.eventCursorStart,
      event_cursor_end: input.eventCursorEnd,
    },
    () => store.writeCommit(input),
  )

export const setProjectIndexSnapshot = (args: {
  projectId: string
  index: Map<string, IndexEntry>
  cursor: string | null
}): void =>
  runDb(
    'cardinal.diff.db.index.snapshot.set',
    {
      project_id: args.projectId,
      index_size: args.index.size,
      cursor: args.cursor,
    },
    () => store.setProjectIndexSnapshot(args),
  )

export const touchProjectCursor = (projectId: string, cursor: string | null): void =>
  runDb(
    'cardinal.diff.db.project.cursor.touch',
    {
      project_id: projectId,
      cursor,
    },
    () => store.touchProjectCursor(projectId, cursor),
  )

export const recordProjectMetrics = (args: {
  projectId: string
  queueDepth: number
  scanStats: ScanStats
  changes: number
}): void =>
  runDb(
    'cardinal.diff.db.metrics.project.record',
    {
      project_id: args.projectId,
      queue_depth: args.queueDepth,
      files_scanned: args.scanStats.filesScanned,
      directories_scanned: args.scanStats.directoriesScanned,
      scan_duration_ms: args.scanStats.elapsedMs,
      changes: args.changes,
    },
    () => store.recordProjectMetrics(args),
  )

export const recordHeartbeat = (args: { projectCount: number; agentPid: number }): void =>
  runDb(
    'cardinal.diff.db.metrics.heartbeat.record',
    {
      project_count: args.projectCount,
      agent_pid: args.agentPid,
    },
    () => store.recordHeartbeat(args),
  )

export const getLatestHeartbeat = (): HeartbeatRow | null =>
  runDb('cardinal.diff.db.metrics.heartbeat.get_latest', {}, () => store.getLatestHeartbeat())

export const listCommits = (args: {
  projectId: string
  sinceNs?: number
  untilNs?: number
  limit?: number
}): CommitRecord[] =>
  runDb(
    'cardinal.diff.db.commits.list',
    {
      project_id: args.projectId,
      since_ns: args.sinceNs ?? null,
      until_ns: args.untilNs ?? null,
      limit: args.limit ?? 100,
    },
    () => store.listCommits(args),
  )

export const listCommitsBySequenceRange = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
}): CommitRecord[] =>
  runDb(
    'cardinal.diff.db.commits.list_by_sequence_range',
    {
      project_id: args.projectId,
      from_sequence: args.fromSequence,
      to_sequence: args.toSequence,
    },
    () => store.listCommitsBySequenceRange(args),
  )

export const getCommit = (commitId: string): CommitRecord | null =>
  runDb(
    'cardinal.diff.db.commit.get',
    {
      commit_id: commitId,
    },
    () => store.getCommit(commitId),
  )

export const getCommitEntries = (commitId: string): CommitEntryRow[] =>
  runDb(
    'cardinal.diff.db.commit.entries.list',
    {
      commit_id: commitId,
    },
    () => store.getCommitEntries(commitId),
  )

export const getFileHistory = (args: {
  projectId: string
  relPath: string
  limit?: number
}): Array<JsonObject> =>
  runDb(
    'cardinal.diff.db.file_history.list',
    {
      project_id: args.projectId,
      rel_path: args.relPath,
      limit: args.limit ?? 100,
    },
    () => store.getFileHistory(args),
  )
