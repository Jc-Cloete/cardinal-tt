import fs from 'node:fs'
import path from 'node:path'
import {
  type GitIgnoreRule,
  isIgnoredByGitIgnoreRules,
  isIgnoredPath,
  loadGitIgnoreRulesFromDirectory,
} from './ignore'
import type { IndexEntry, ScanStats } from './types'

const toPosixPath = (value: string): string => value.split(path.sep).join('/')
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

const scanSubtreeInternal = (
  rootPath: string,
  relRoot: string,
  ignoreRules: string[],
): ScanTreeResult => {
  // Iterative scan avoids deep recursion limits on large trees.
  const startedAt = Date.now()
  const entries = new Map<string, IndexEntry>()
  const stats = emptyStats()
  const stack: ScanNodeState[] = [
    {
      relDir: relRoot,
      gitIgnoreRules: buildGitIgnoreRuleChain(rootPath, relRoot),
    },
  ]

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

        entries.set(normalizedRelPath, {
          relPath: normalizedRelPath,
          kind: 'dir',
          size: 0,
          mtimeNs: toNs(directoryStats.mtimeMs),
          inode: Number(directoryStats.ino || 0),
          device: Number(directoryStats.dev || 0),
          modeBits: Number.isFinite(directoryStats.mode) ? directoryStats.mode : null,
          hash: null,
          symlinkTarget: null,
        })
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

        entries.set(normalizedRelPath, {
          relPath: normalizedRelPath,
          kind: 'symlink',
          size: 0,
          mtimeNs: toNs(fileStats.mtimeMs),
          inode: Number(fileStats.ino || 0),
          device: Number(fileStats.dev || 0),
          modeBits: Number.isFinite(fileStats.mode) ? fileStats.mode : null,
          hash: null,
          symlinkTarget: target,
        })
        continue
      }

      if (!fileStats.isFile()) {
        continue
      }

      stats.filesScanned += 1
      entries.set(normalizedRelPath, {
        relPath: normalizedRelPath,
        kind: 'file',
        size: Number(fileStats.size || 0),
        mtimeNs: toNs(fileStats.mtimeMs),
        inode: Number(fileStats.ino || 0),
        device: Number(fileStats.dev || 0),
        modeBits: Number.isFinite(fileStats.mode) ? fileStats.mode : null,
        hash: null,
        symlinkTarget: null,
      })
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
