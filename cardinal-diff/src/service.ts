import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {buildChangeset} from './change-detector'
import {
  addProject,
  getCommit,
  getCommitEntries,
  getFileHistory,
  getProjectById,
  listCommits,
  listCommitsBySequenceRange,
  listProjects,
  readIndex,
  recordProjectMetrics,
  removeProject,
  setProjectIndexSnapshot,
  touchProjectCursor,
  writeCommit,
  type CommitEntryRow,
} from './db'
import {DEFAULT_IGNORE_PATTERNS} from './defaults'
import {loadProjectIgnoreRules} from './ignore'
import {storeBlobFromFile} from './object-store'
import {projectsDir} from './paths'
import {getMinimalDirtyRoots, replaceIndexRegions, scanProjectSubtree, scanProjectTree} from './scanner'
import type {
  ChangedEntry,
  CommitRecord,
  HashPolicy,
  IndexEntry,
  ProjectConfig,
  ProjectMode,
  ScanStats,
} from './types'

const isPathInsideHome = (absolutePath: string): boolean => {
  const home = path.resolve(os.homedir())
  const normalized = path.resolve(absolutePath)
  return normalized === home || normalized.startsWith(`${home}${path.sep}`)
}

const toPosixPath = (value: string): string => value.split(path.sep).join('/')

const materializeContentRefs = (
  rootPath: string,
  index: Map<string, IndexEntry>,
  maxBlobSizeBytes: number,
): Map<string, IndexEntry> => {
  const next = new Map<string, IndexEntry>(index)
  for (const [relPath, entry] of next.entries()) {
    if (entry.kind !== 'file' || entry.hash) {
      continue
    }

    const ref = storeBlobFromFile(path.join(rootPath, relPath), maxBlobSizeBytes)
    if (ref) {
      next.set(relPath, {...entry, hash: ref})
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

const persistProjectConfigFile = (project: ProjectConfig): void => {
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

  fs.writeFileSync(projectConfigFilePath(project.projectId), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export const listProjectsService = (): ProjectConfig[] => listProjects()

export const getProjectService = (projectId: string): ProjectConfig | null =>
  getProjectById(projectId)

export const addProjectService = (input: {
  rootPath: string
  name?: string
  mode?: ProjectMode
  hashPolicy?: HashPolicy
}): ProjectConfig => {
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

  const project = addProject({
    name,
    rootPath: absolute,
    mode,
    hashPolicy: input.hashPolicy === 'on_change' ? 'on_change' : 'off',
    ignoreRules: ignoreRules.length > 0 ? ignoreRules : DEFAULT_IGNORE_PATTERNS,
  })

  const scanned = scanProjectTree(absolute, project.ignoreRules)
  const seededIndex = project.mode === 'content'
    ? materializeContentRefs(absolute, scanned.entries, project.maxBlobSizeBytes)
    : scanned.entries

  setProjectIndexSnapshot({
    projectId: project.projectId,
    index: seededIndex,
    cursor: project.lastEventCursor,
  })
  persistProjectConfigFile(project)

  return project
}

export const removeProjectService = (projectId: string): void => {
  removeProject(projectId)
  const filePath = projectConfigFilePath(projectId)
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, {force: true})
  }
}

export const loadProjectRuntime = (projectId: string): {
  project: ProjectConfig
  index: Map<string, IndexEntry>
} | null => {
  const project = getProjectById(projectId)
  if (!project) {
    return null
  }

  return {
    project,
    index: readIndex(projectId),
  }
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
} => {
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
      scanResults.map((item) => ({root: item.root, entries: item.entries})),
    )

  const normalizedIndex = input.project.mode === 'content'
    ? materializeContentRefs(input.project.rootPath, mergedIndex, input.project.maxBlobSizeBytes)
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
}

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
}): CommitRecord | null => {
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
}

export const listCommitsService = (args: {
  projectId: string
  sinceNs?: number
  untilNs?: number
  limit?: number
}): CommitRecord[] => listCommits(args)

export const listCommitsBySequenceRangeService = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
}): CommitRecord[] => listCommitsBySequenceRange(args)

export const getCommitDetailsService = (commitId: string): {
  commit: CommitRecord
  entries: CommitEntryRow[]
} | null => {
  const commit = getCommit(commitId)
  if (!commit) {
    return null
  }

  return {
    commit,
    entries: getCommitEntries(commitId),
  }
}

export const getFileHistoryService = (args: {
  projectId: string
  relPath: string
  limit?: number
}): Array<Record<string, unknown>> => getFileHistory(args)

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
      .map((entry) => ({commit, entry})),
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

export const runDoctorService = (args: {
  projectId: string
  repair?: boolean
}): DoctorResult => {
  const runtime = loadProjectRuntime(args.projectId)
  if (!runtime) {
    throw new Error(`Project not found: ${args.projectId}`)
  }

  const scanned = scanProjectTree(runtime.project.rootPath, runtime.project.ignoreRules)
  const expectedIndex = runtime.project.mode === 'content'
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
}
