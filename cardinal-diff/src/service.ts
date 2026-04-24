import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildChangeset } from './change-detector'
import {
  addProject,
  type CommitEntryRow,
  getCommit,
  getCommitEntries,
  getFileHistory,
  getLatestHeartbeat,
  getProjectById,
  getProjectByRootPath,
  listCommits,
  listCommitsBySequenceRange,
  listProjects,
  readIndex,
  recordProjectMetrics,
  removeProject,
  reprocessProject,
  setProjectIndexSnapshot,
  touchProjectCursor,
  writeCommit,
} from './db'
import { DEFAULT_IGNORE_PATTERNS } from './defaults'
import { loadProjectIgnoreRules } from './ignore'
import { storeBlobFromFile } from './object-store'
import { diffLogger } from './observability'
import { toPosixPath } from './path-utils'
import { projectsDir } from './paths'
import {
  getMinimalDirtyRoots,
  replaceIndexRegions,
  scanProjectSubtree,
  scanProjectTree,
} from './scanner'
import type {
  ChangedEntry,
  CommitRecord,
  HashPolicy,
  IndexEntry,
  JsonObject,
  ProjectConfig,
  ProjectMode,
  ScanStats,
} from './types'

const serviceLogger = diffLogger.child({ component: 'service' })

const isPathInsideHome = (absolutePath: string): boolean => {
  const home = path.resolve(os.homedir())
  const normalized = path.resolve(absolutePath)
  return normalized === home || normalized.startsWith(`${home}${path.sep}`)
}

const materializeContentRefs = (
  rootPath: string,
  index: Map<string, IndexEntry>,
  maxBlobSizeBytes: number,
): Map<string, IndexEntry> => {
  // Seed missing blob references so later diffs can reconstruct content history.
  const next = new Map<string, IndexEntry>(index)
  for (const [relPath, entry] of next.entries()) {
    if (entry.kind !== 'file' || entry.hash) {
      continue
    }

    const ref = storeBlobFromFile(path.join(rootPath, relPath), maxBlobSizeBytes)
    if (ref) {
      next.set(relPath, { ...entry, hash: ref })
    }
  }

  return next
}

const mergeScanStats = (parts: ScanStats[]): ScanStats => ({
  directoriesScanned: parts.reduce((sum, item) => sum + item.directoriesScanned, 0),
  filesScanned: parts.reduce((sum, item) => sum + item.filesScanned, 0),
  elapsedMs: parts.reduce((sum, item) => sum + item.elapsedMs, 0),
})

const projectConfigFilePath = (projectId: string): string =>
  path.join(projectsDir, `${projectId}.json`)

const REPROCESS_AGENT_STALE_AFTER_MS = 45_000

const isAgentProcessAlive = (pid: number | null): boolean => {
  if (pid === null) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const assertAgentSafeForReprocess = (allowActiveAgent: boolean): void => {
  if (allowActiveAgent) {
    return
  }

  const heartbeat = getLatestHeartbeat()
  if (!heartbeat || heartbeat.agentPid === null || !heartbeat.createdAt) {
    return
  }

  const heartbeatTimestamp = Date.parse(heartbeat.createdAt)
  if (!Number.isFinite(heartbeatTimestamp)) {
    return
  }

  const heartbeatAgeMs = Math.max(0, Date.now() - heartbeatTimestamp)
  if (heartbeatAgeMs > REPROCESS_AGENT_STALE_AFTER_MS) {
    return
  }

  if (isAgentProcessAlive(heartbeat.agentPid)) {
    throw new Error(
      `Refusing to reprocess while cardinal-diff agent is active (pid=${heartbeat.agentPid}). Stop the agent or retry with --allow-active-agent.`,
    )
  }
}

export const persistProjectConfigFile = (project: ProjectConfig): void => {
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.config.persist',
      fields: {
        project_id: project.projectId,
        project_name: project.name,
        root_path: project.rootPath,
        mode: project.mode,
        hash_policy: project.hashPolicy,
      },
    },
    () => {
      const payload = {
        projectId: project.projectId,
        name: project.name,
        rootPath: project.rootPath,
        enabled: project.enabled,
        ignoreRules: project.ignoreRules,
        mode: project.mode,
        hashPolicy: project.hashPolicy,
        maxBlobSizeBytes: project.maxBlobSizeBytes,
        debounceMs: project.debounceMs,
        commitIdleMs: project.commitIdleMs,
        commitMaxIntervalMs: project.commitMaxIntervalMs,
        lastEventCursor: project.lastEventCursor,
      }

      fs.writeFileSync(
        projectConfigFilePath(project.projectId),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8',
      )
    },
  )
}

export const listProjectsService = (): ProjectConfig[] =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.projects.list',
    },
    () => listProjects(),
  )

export const getProjectService = (projectId: string): ProjectConfig | null =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.get',
      fields: {
        project_id: projectId,
      },
    },
    () => getProjectById(projectId),
  )

export const addProjectService = (input: {
  rootPath: string
  name?: string
  mode?: ProjectMode
  hashPolicy?: HashPolicy
}): ProjectConfig =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.add',
      fields: {
        root_path_input: input.rootPath,
        name_input: input.name || null,
        mode_input: input.mode || 'metadata',
        hash_policy_input: input.hashPolicy || 'off',
      },
    },
    () => {
      const absolute = path.resolve(input.rootPath)
      if (!fs.existsSync(absolute)) {
        throw new Error(`Path does not exist: ${absolute}`)
      }

      if (!fs.lstatSync(absolute).isDirectory()) {
        throw new Error(`Path is not a directory: ${absolute}`)
      }

      if (!isPathInsideHome(absolute)) {
        throw new Error(`Project path must be inside ${os.homedir()}`)
      }

      const ignoreRules = loadProjectIgnoreRules(absolute)
      const mode: ProjectMode = input.mode === 'content' ? 'content' : 'metadata'
      const name = input.name?.trim() || path.basename(absolute)
      const existing = getProjectByRootPath(absolute)
      if (existing) {
        serviceLogger.log({
          event: 'cardinal.diff.project.add.exists',
          fields: {
            project_id: existing.projectId,
            root_path: absolute,
          },
        })
        return existing
      }

      const project = addProject({
        name,
        rootPath: absolute,
        mode,
        hashPolicy: input.hashPolicy === 'on_change' ? 'on_change' : 'off',
        ignoreRules: ignoreRules.length > 0 ? ignoreRules : DEFAULT_IGNORE_PATTERNS,
      })

      const scanned = scanProjectTree(absolute, project.ignoreRules)
      const seededIndex =
        project.mode === 'content'
          ? materializeContentRefs(absolute, scanned.entries, project.maxBlobSizeBytes)
          : scanned.entries

      setProjectIndexSnapshot({
        projectId: project.projectId,
        index: seededIndex,
        cursor: project.lastEventCursor,
      })
      persistProjectConfigFile(project)

      return project
    },
  )

export const removeProjectService = (projectId: string): void => {
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.remove',
      fields: {
        project_id: projectId,
      },
    },
    () => {
      removeProject(projectId)
      const filePath = projectConfigFilePath(projectId)
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true })
      }
    },
  )
}

export type ReprocessProjectResult = {
  projectId: string
  rootPath: string
  mode: ProjectMode
  hashPolicy: HashPolicy
  indexedEntries: number
  cursor: string | null
}

export const reprocessProjectService = (args: {
  projectId: string
  allowActiveAgent?: boolean
}): ReprocessProjectResult =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.reprocess',
      fields: {
        project_id: args.projectId,
        allow_active_agent: Boolean(args.allowActiveAgent),
      },
    },
    () => {
      assertAgentSafeForReprocess(Boolean(args.allowActiveAgent))

      const runtime = loadProjectRuntime(args.projectId)
      if (!runtime) {
        throw new Error(`Project not found: ${args.projectId}`)
      }

      const scanned = scanProjectTree(runtime.project.rootPath, runtime.project.ignoreRules)
      const nextIndex =
        runtime.project.mode === 'content'
          ? materializeContentRefs(
              runtime.project.rootPath,
              scanned.entries,
              runtime.project.maxBlobSizeBytes,
            )
          : scanned.entries

      reprocessProject({
        projectId: runtime.project.projectId,
        index: nextIndex,
        cursor: runtime.project.lastEventCursor,
      })
      persistProjectConfigFile(runtime.project)

      return {
        projectId: runtime.project.projectId,
        rootPath: runtime.project.rootPath,
        mode: runtime.project.mode,
        hashPolicy: runtime.project.hashPolicy,
        indexedEntries: nextIndex.size,
        cursor: runtime.project.lastEventCursor,
      }
    },
  )

export const loadProjectRuntime = (
  projectId: string,
): {
  project: ProjectConfig
  index: Map<string, IndexEntry>
} | null => {
  return serviceLogger.run(
    {
      event: 'cardinal.diff.project.runtime.load',
      fields: {
        project_id: projectId,
      },
    },
    () => {
      const project = getProjectById(projectId)
      if (!project) {
        return null
      }

      persistProjectConfigFile(project)

      return {
        project,
        index: readIndex(projectId),
      }
    },
  )
}

export const scanProjectDelta = (input: {
  project: ProjectConfig
  currentIndex: Map<string, IndexEntry>
  dirtyPaths: Set<string>
  fullRescan: boolean
}): {
  nextIndex: Map<string, IndexEntry>
  changes: ChangedEntry[]
  changedScopes: string[]
  scanStats: ScanStats
} =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.scan_delta',
      level: 'debug',
      fields: {
        project_id: input.project.projectId,
        root_path: input.project.rootPath,
        full_rescan: input.fullRescan,
        dirty_path_count: input.dirtyPaths.size,
        previous_index_size: input.currentIndex.size,
      },
    },
    () => {
      // Scan only impacted roots, then reconcile into the previous full index snapshot.
      const dirtyRoots = input.fullRescan ? [''] : getMinimalDirtyRoots(input.dirtyPaths)
      const scanResults = dirtyRoots.map((root) => ({
        root,
        ...scanProjectSubtree(input.project.rootPath, root, input.project.ignoreRules),
      }))
      const scanStats = mergeScanStats(scanResults.map((item) => item.stats))

      const mergedIndex = input.fullRescan
        ? scanResults[0]?.entries || new Map<string, IndexEntry>()
        : replaceIndexRegions(
            input.currentIndex,
            scanResults.map((item) => ({ root: item.root, entries: item.entries })),
          )

      const normalizedIndex =
        input.project.mode === 'content'
          ? materializeContentRefs(
              input.project.rootPath,
              mergedIndex,
              input.project.maxBlobSizeBytes,
            )
          : mergedIndex

      const changedScopes = dirtyRoots.map((item) => toPosixPath(item))
      const delta = buildChangeset({
        projectRoot: input.project.rootPath,
        previousIndex: input.currentIndex,
        currentIndex: normalizedIndex,
        changedScopes,
        mode: input.project.mode,
        hashPolicy: input.project.hashPolicy,
        maxBlobSizeBytes: input.project.maxBlobSizeBytes,
      })

      return {
        nextIndex: delta.nextIndex,
        changes: delta.changes,
        changedScopes,
        scanStats,
      }
    },
  )

export const persistProjectBatch = (input: {
  projectId: string
  startedAtNs: number
  endedAtNs: number
  eventCursorStart: string | null
  eventCursorEnd: string | null
  changes: ChangedEntry[]
  nextIndex: Map<string, IndexEntry>
  queueDepth: number
  scanStats: ScanStats
}): CommitRecord | null =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.project.batch.persist',
      fields: {
        project_id: input.projectId,
        started_at_ns: input.startedAtNs,
        ended_at_ns: input.endedAtNs,
        event_cursor_start: input.eventCursorStart,
        event_cursor_end: input.eventCursorEnd,
        change_count: input.changes.length,
        next_index_size: input.nextIndex.size,
        queue_depth: input.queueDepth,
        files_scanned: input.scanStats.filesScanned,
        directories_scanned: input.scanStats.directoriesScanned,
        scan_elapsed_ms: input.scanStats.elapsedMs,
      },
    },
    () => {
      recordProjectMetrics({
        projectId: input.projectId,
        queueDepth: input.queueDepth,
        scanStats: input.scanStats,
        changes: input.changes.length,
      })

      if (input.changes.length === 0) {
        touchProjectCursor(input.projectId, input.eventCursorEnd)
        return null
      }

      return writeCommit({
        projectId: input.projectId,
        startedAtNs: input.startedAtNs,
        endedAtNs: input.endedAtNs,
        eventCursorStart: input.eventCursorStart,
        eventCursorEnd: input.eventCursorEnd,
        changes: input.changes,
        nextIndex: input.nextIndex,
      })
    },
  )

export const listCommitsService = (args: {
  projectId: string
  sinceNs?: number
  untilNs?: number
  limit?: number
}): CommitRecord[] =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.commits.list',
      fields: {
        project_id: args.projectId,
        since_ns: args.sinceNs ?? null,
        until_ns: args.untilNs ?? null,
        limit: args.limit ?? 100,
      },
    },
    () => listCommits(args),
  )

export const listCommitsBySequenceRangeService = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
}): CommitRecord[] =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.commits.list_by_sequence_range',
      fields: {
        project_id: args.projectId,
        from_sequence: args.fromSequence,
        to_sequence: args.toSequence,
      },
    },
    () => listCommitsBySequenceRange(args),
  )

export const getCommitDetailsService = (
  commitId: string,
): {
  commit: CommitRecord
  entries: CommitEntryRow[]
} | null => {
  return serviceLogger.run(
    {
      event: 'cardinal.diff.commit.details.get',
      fields: {
        commit_id: commitId,
      },
    },
    () => {
      const commit = getCommit(commitId)
      if (!commit) {
        return null
      }

      return {
        commit,
        entries: getCommitEntries(commitId),
      }
    },
  )
}

export const getFileHistoryService = (args: {
  projectId: string
  relPath: string
  limit?: number
}): JsonObject[] =>
  serviceLogger.run(
    {
      event: 'cardinal.diff.file_history.list',
      fields: {
        project_id: args.projectId,
        rel_path: args.relPath,
        limit: args.limit ?? 100,
      },
    },
    () => getFileHistory(args),
  )

export type CommitRangeEntry = {
  commit: CommitRecord
  entry: CommitEntryRow
}

export const listCommitRangeEntriesService = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
  relPath?: string
}): CommitRangeEntry[] => {
  return serviceLogger.run(
    {
      event: 'cardinal.diff.commit.range_entries.list',
      fields: {
        project_id: args.projectId,
        from_sequence: args.fromSequence,
        to_sequence: args.toSequence,
        rel_path: args.relPath ?? null,
      },
    },
    () => {
      const commits = listCommitsBySequenceRange({
        projectId: args.projectId,
        fromSequence: args.fromSequence,
        toSequence: args.toSequence,
      })

      return commits.flatMap((commit) =>
        getCommitEntries(commit.commitId)
          .filter((entry) =>
            args.relPath
              ? entry.relPath === args.relPath || entry.oldRelPath === args.relPath
              : true,
          )
          .map((entry) => ({ commit, entry })),
      )
    },
  )
}

const sameIndexEntry = (left: IndexEntry | undefined, right: IndexEntry | undefined): boolean => {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return (
    left.kind === right.kind &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.inode === right.inode &&
    left.device === right.device &&
    left.modeBits === right.modeBits &&
    left.hash === right.hash &&
    left.symlinkTarget === right.symlinkTarget
  )
}

export type DoctorResult = {
  projectId: string
  rootPath: string
  ok: boolean
  scannedEntries: number
  indexedEntries: number
  missingInIndex: string[]
  staleInIndex: string[]
  mismatched: string[]
  repaired: boolean
}

export const runDoctorService = (args: { projectId: string; repair?: boolean }): DoctorResult => {
  return serviceLogger.run(
    {
      event: 'cardinal.diff.project.doctor.run',
      fields: {
        project_id: args.projectId,
        repair: Boolean(args.repair),
      },
    },
    () => {
      const runtime = loadProjectRuntime(args.projectId)
      if (!runtime) {
        throw new Error(`Project not found: ${args.projectId}`)
      }

      const scanned = scanProjectTree(runtime.project.rootPath, runtime.project.ignoreRules)
      const expectedIndex =
        runtime.project.mode === 'content'
          ? materializeContentRefs(
              runtime.project.rootPath,
              scanned.entries,
              runtime.project.maxBlobSizeBytes,
            )
          : scanned.entries

      const missingInIndex: string[] = []
      const staleInIndex: string[] = []
      const mismatched: string[] = []

      for (const relPath of expectedIndex.keys()) {
        if (!runtime.index.has(relPath)) {
          missingInIndex.push(relPath)
        }
      }

      for (const relPath of runtime.index.keys()) {
        if (!expectedIndex.has(relPath)) {
          staleInIndex.push(relPath)
        }
      }

      for (const [relPath, scannedEntry] of expectedIndex.entries()) {
        if (!sameIndexEntry(scannedEntry, runtime.index.get(relPath))) {
          if (runtime.index.has(relPath)) {
            mismatched.push(relPath)
          }
        }
      }

      const ok = missingInIndex.length === 0 && staleInIndex.length === 0 && mismatched.length === 0

      if (!ok && args.repair) {
        setProjectIndexSnapshot({
          projectId: runtime.project.projectId,
          index: expectedIndex,
          cursor: runtime.project.lastEventCursor,
        })
      }

      return {
        projectId: runtime.project.projectId,
        rootPath: runtime.project.rootPath,
        ok,
        scannedEntries: expectedIndex.size,
        indexedEntries: runtime.index.size,
        missingInIndex: missingInIndex.sort((a, b) => a.localeCompare(b)),
        staleInIndex: staleInIndex.sort((a, b) => a.localeCompare(b)),
        mismatched: mismatched.sort((a, b) => a.localeCompare(b)),
        repaired: Boolean(!ok && args.repair),
      }
    },
  )
}
