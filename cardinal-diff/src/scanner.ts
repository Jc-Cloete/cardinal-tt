import fs from 'node:fs'
import path from 'node:path'
import {
  type GitIgnoreRule,
  isIgnoredByGitIgnoreRules,
  isIgnoredPath,
  loadGitIgnoreRulesFromDirectory,
} from './ignore'
import { toPosixPath } from './path-utils'
import type { IndexEntry, ScanStats } from './types'

const toNs = (mtimeMs: number): number => Math.round(mtimeMs * 1_000_000)

type ScanTreeResult = {
  entries: Map<string, IndexEntry>
  stats: ScanStats
}

const emptyStats = (): ScanStats => ({
  directoriesScanned: 0,
  filesScanned: 0,
  elapsedMs: 0,
})

type ScanNodeState = {
  relDir: string
  gitIgnoreRules: GitIgnoreRule[]
}

const splitPathSegments = (value: string): string[] =>
  toPosixPath(value)
    .split('/')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const buildGitIgnoreRuleChain = (rootPath: string, relDir: string): GitIgnoreRule[] => {
  const segments = splitPathSegments(relDir)
  const directories = ['']
  for (let index = 1; index <= segments.length; index += 1) {
    directories.push(segments.slice(0, index).join('/'))
  }

  return directories.flatMap((directory) => loadGitIgnoreRulesFromDirectory(rootPath, directory))
}

const withDirectoryGitIgnoreRules = (
  rootPath: string,
  relDir: string,
  inheritedRules: GitIgnoreRule[],
): GitIgnoreRule[] => {
  const localRules = loadGitIgnoreRulesFromDirectory(rootPath, relDir)
  if (localRules.length === 0) {
    return inheritedRules
  }
  return [...inheritedRules, ...localRules]
}

const toEntryFromStats = (
  relPath: string,
  kind: IndexEntry['kind'],
  stats: fs.Stats,
  symlinkTarget: string | null,
): IndexEntry => ({
  relPath,
  kind,
  size: kind === 'file' ? Number(stats.size || 0) : 0,
  mtimeNs: toNs(stats.mtimeMs),
  inode: Number(stats.ino || 0),
  device: Number(stats.dev || 0),
  modeBits: Number.isFinite(stats.mode) ? stats.mode : null,
  hash: null,
  symlinkTarget,
})

const scanSubtreeInternal = (
  rootPath: string,
  relRoot: string,
  ignoreRules: string[],
): ScanTreeResult => {
  // Iterative scan avoids deep recursion limits on large trees.
  const startedAt = Date.now()
  const entries = new Map<string, IndexEntry>()
  const stats = emptyStats()
  const initialGitIgnoreRules = buildGitIgnoreRuleChain(rootPath, relRoot)
  const stack: ScanNodeState[] = []

  if (relRoot === '') {
    stack.push({
      relDir: relRoot,
      gitIgnoreRules: initialGitIgnoreRules,
    })
  } else {
    const normalizedRelRoot = toPosixPath(relRoot)
    const absRoot = path.join(rootPath, relRoot)

    let rootStats: fs.Stats
    try {
      rootStats = fs.lstatSync(absRoot)
    } catch {
      stats.elapsedMs = Date.now() - startedAt
      return { entries, stats }
    }

    if (
      isIgnoredPath(normalizedRelRoot, rootStats.isDirectory(), ignoreRules) ||
      isIgnoredByGitIgnoreRules(normalizedRelRoot, rootStats.isDirectory(), initialGitIgnoreRules)
    ) {
      stats.elapsedMs = Date.now() - startedAt
      return { entries, stats }
    }

    if (rootStats.isSymbolicLink()) {
      let target: string | null = null
      try {
        target = fs.readlinkSync(absRoot)
      } catch {
        target = null
      }
      entries.set(
        normalizedRelRoot,
        toEntryFromStats(normalizedRelRoot, 'symlink', rootStats, target),
      )
      stats.elapsedMs = Date.now() - startedAt
      return { entries, stats }
    }

    if (!rootStats.isDirectory()) {
      if (rootStats.isFile()) {
        stats.filesScanned += 1
        entries.set(normalizedRelRoot, toEntryFromStats(normalizedRelRoot, 'file', rootStats, null))
      }
      stats.elapsedMs = Date.now() - startedAt
      return { entries, stats }
    }

    entries.set(normalizedRelRoot, toEntryFromStats(normalizedRelRoot, 'dir', rootStats, null))
    stack.push({
      relDir: relRoot,
      gitIgnoreRules: initialGitIgnoreRules,
    })
  }

  while (stack.length > 0) {
    const state = stack.pop()
    if (!state) {
      continue
    }

    const relDir = state.relDir
    const absDir = relDir ? path.join(rootPath, relDir) : rootPath
    stats.directoriesScanned += 1

    let dirEntries: fs.Dirent[]
    try {
      dirEntries = fs.readdirSync(absDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of dirEntries) {
      const relPath = relDir ? path.join(relDir, entry.name) : entry.name
      const normalizedRelPath = toPosixPath(relPath)
      const absPath = path.join(rootPath, relPath)

      if (entry.isDirectory()) {
        if (
          isIgnoredPath(normalizedRelPath, true, ignoreRules) ||
          isIgnoredByGitIgnoreRules(normalizedRelPath, true, state.gitIgnoreRules)
        ) {
          continue
        }

        stack.push({
          relDir: relPath,
          gitIgnoreRules: withDirectoryGitIgnoreRules(rootPath, relPath, state.gitIgnoreRules),
        })

        let directoryStats: fs.Stats
        try {
          directoryStats = fs.lstatSync(absPath)
        } catch {
          continue
        }

        entries.set(
          normalizedRelPath,
          toEntryFromStats(normalizedRelPath, 'dir', directoryStats, null),
        )
        continue
      }

      if (
        isIgnoredPath(normalizedRelPath, false, ignoreRules) ||
        isIgnoredByGitIgnoreRules(normalizedRelPath, false, state.gitIgnoreRules)
      ) {
        continue
      }

      let fileStats: fs.Stats
      try {
        fileStats = fs.lstatSync(absPath)
      } catch {
        continue
      }

      if (fileStats.isSymbolicLink()) {
        let target: string | null = null
        try {
          target = fs.readlinkSync(absPath)
        } catch {
          target = null
        }

        entries.set(
          normalizedRelPath,
          toEntryFromStats(normalizedRelPath, 'symlink', fileStats, target),
        )
        continue
      }

      if (!fileStats.isFile()) {
        continue
      }

      stats.filesScanned += 1
      entries.set(normalizedRelPath, toEntryFromStats(normalizedRelPath, 'file', fileStats, null))
    }
  }

  stats.elapsedMs = Date.now() - startedAt
  return { entries, stats }
}

export const scanProjectTree = (rootPath: string, ignoreRules: string[]): ScanTreeResult =>
  scanSubtreeInternal(rootPath, '', ignoreRules)

export const scanProjectSubtree = (
  rootPath: string,
  relRoot: string,
  ignoreRules: string[],
): ScanTreeResult => scanSubtreeInternal(rootPath, relRoot, ignoreRules)

const normalizeRoot = (value: string): string => {
  const normalized = toPosixPath(value).replace(/^\/+|\/+$/g, '')
  return normalized
}

const isUnder = (relPath: string, root: string): boolean =>
  root === '' || relPath === root || relPath.startsWith(`${root}/`)

export const getMinimalDirtyRoots = (dirtyPaths: Iterable<string>): string[] => {
  const normalized = Array.from(dirtyPaths)
    .map((item) => normalizeRoot(item))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))

  if (normalized.length === 0) {
    return ['']
  }

  const minimal: string[] = []
  for (const candidate of normalized) {
    if (candidate === '') {
      return ['']
    }
    if (minimal.some((root) => isUnder(candidate, root))) {
      continue
    }

    minimal.push(candidate)
  }

  const unique = Array.from(new Set(minimal))
  return unique.length > 0 ? unique : ['']
}

export const replaceIndexRegions = (
  previousIndex: Map<string, IndexEntry>,
  scannedEntriesByRoot: Array<{ root: string; entries: Map<string, IndexEntry> }>,
): Map<string, IndexEntry> => {
  // Remove stale rows for rescanned roots before inserting fresh entries.
  const next = new Map(previousIndex)

  const roots = scannedEntriesByRoot.map((item) => item.root).sort((a, b) => a.localeCompare(b))
  for (const relPath of next.keys()) {
    if (roots.some((root) => isUnder(relPath, root))) {
      next.delete(relPath)
    }
  }

  for (const scanned of scannedEntriesByRoot) {
    for (const entry of scanned.entries.values()) {
      next.set(entry.relPath, entry)
    }
  }

  return next
}
