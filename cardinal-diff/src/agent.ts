import fs from 'node:fs'
import path from 'node:path'
import {constants, getInfo, watch} from 'fsevents'
import {mergePendingChanges} from './pending-buffer'
import {launchAgentPlistPath, logsDir, repoRoot} from './paths'
import {
  listProjectsService,
  loadProjectRuntime,
  persistProjectBatch,
  scanProjectDelta,
} from './service'
import type {ChangedEntry, IndexEntry, ProjectConfig, ScanStats} from './types'

type ProjectRuntimeState = {
  project: ProjectConfig
  currentIndex: Map<string, IndexEntry>
  pendingChanges: Map<string, ChangedEntry>
  pendingStartNs: number | null
  firstCursor: string | null
  lastCursor: string | null
  dirtyPaths: Set<string>
  fullRescan: boolean
  scanStats: ScanStats
  scanTimer: ReturnType<typeof setTimeout> | null
  flushIdleTimer: ReturnType<typeof setTimeout> | null
  flushMaxTimer: ReturnType<typeof setTimeout> | null
  scanInProgress: boolean
  scanRequestedAgain: boolean
  stopWatcher: (() => void) | null
}

const zeroStats = (): ScanStats => ({
  directoriesScanned: 0,
  filesScanned: 0,
  elapsedMs: 0,
})

const addStats = (left: ScanStats, right: ScanStats): ScanStats => ({
  directoriesScanned: left.directoriesScanned + right.directoriesScanned,
  filesScanned: left.filesScanned + right.filesScanned,
  elapsedMs: left.elapsedMs + right.elapsedMs,
})

const nowNs = (): number => Date.now() * 1_000_000

const toPosixPath = (value: string): string => value.split(path.sep).join('/')

const formatDateTimeNs = (value: number): string =>
  new Date(Math.floor(value / 1_000_000)).toISOString()

const queueDepth = (state: ProjectRuntimeState): number =>
  state.pendingChanges.size + state.dirtyPaths.size

const clearTimers = (state: ProjectRuntimeState): void => {
  if (state.scanTimer) {
    clearTimeout(state.scanTimer)
    state.scanTimer = null
  }
  if (state.flushIdleTimer) {
    clearTimeout(state.flushIdleTimer)
    state.flushIdleTimer = null
  }
  if (state.flushMaxTimer) {
    clearTimeout(state.flushMaxTimer)
    state.flushMaxTimer = null
  }
}

const parseStartCursor = (cursor: string | null): {since: number; fullRescan: boolean} => {
  if (!cursor) {
    return {since: 0, fullRescan: false}
  }

  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {since: 0, fullRescan: true}
  }

  return {since: parsed, fullRescan: false}
}

const createProjectState = (project: ProjectConfig): ProjectRuntimeState | null => {
  const runtime = loadProjectRuntime(project.projectId)
  if (!runtime) {
    return null
  }

  const startCursor = parseStartCursor(runtime.project.lastEventCursor)
  return {
    project: runtime.project,
    currentIndex: runtime.index,
    pendingChanges: new Map(),
    pendingStartNs: null,
    firstCursor: null,
    lastCursor: runtime.project.lastEventCursor,
    dirtyPaths: new Set(),
    fullRescan: startCursor.fullRescan,
    scanStats: zeroStats(),
    scanTimer: null,
    flushIdleTimer: null,
    flushMaxTimer: null,
    scanInProgress: false,
    scanRequestedAgain: false,
    stopWatcher: null,
  }
}

const scheduleScan = (state: ProjectRuntimeState, trigger: () => void): void => {
  if (state.scanTimer) {
    clearTimeout(state.scanTimer)
  }

  state.scanTimer = setTimeout(trigger, state.project.debounceMs)
}

const scheduleFlush = (state: ProjectRuntimeState, flush: () => void): void => {
  if (state.flushIdleTimer) {
    clearTimeout(state.flushIdleTimer)
  }
  state.flushIdleTimer = setTimeout(flush, state.project.commitIdleMs)

  if (!state.flushMaxTimer) {
    state.flushMaxTimer = setTimeout(flush, state.project.commitMaxIntervalMs)
  }
}

const pathToRelative = (projectRoot: string, absolutePath: string): string | null => {
  const rel = path.relative(projectRoot, absolutePath)
  if (rel === '' || rel === '.') {
    return ''
  }
  if (rel.startsWith('..')) {
    return null
  }
  return toPosixPath(rel)
}

const normalizeDirtyPath = (relPath: string, eventType: string): string => {
  if (!relPath) {
    return ''
  }
  if (eventType === 'file') {
    const parent = path.dirname(relPath)
    return parent === '.' ? '' : toPosixPath(parent)
  }
  return relPath
}

const shouldForceFullRescan = (flags: number): boolean =>
  Boolean(
    flags & constants.MustScanSubDirs ||
    flags & constants.UserDropped ||
    flags & constants.KernelDropped ||
    flags & constants.EventIdsWrapped ||
    flags & constants.RootChanged,
  )

const runScan = async (state: ProjectRuntimeState): Promise<void> => {
  if (state.scanInProgress) {
    state.scanRequestedAgain = true
    return
  }

  if (!state.fullRescan && state.dirtyPaths.size === 0) {
    return
  }

  state.scanInProgress = true
  try {
    const result = scanProjectDelta({
      project: state.project,
      currentIndex: state.currentIndex,
      dirtyPaths: state.dirtyPaths,
      fullRescan: state.fullRescan,
    })

    state.currentIndex = result.nextIndex
    state.pendingChanges = mergePendingChanges(state.pendingChanges, result.changes)
    state.scanStats = addStats(state.scanStats, result.scanStats)
    state.fullRescan = false
    state.dirtyPaths.clear()
  } catch (error) {
    console.error(`[cardinaldiff] scan failed project=${state.project.name}`, error)
    state.fullRescan = true
  } finally {
    state.scanInProgress = false
    state.scanTimer = null
    if (state.scanRequestedAgain) {
      state.scanRequestedAgain = false
      scheduleScan(state, () => {
        void runScan(state)
      })
    }
  }
}

const flushProject = async (state: ProjectRuntimeState): Promise<void> => {
  await runScan(state)

  if (state.pendingStartNs === null) {
    clearTimers(state)
    state.scanStats = zeroStats()
    return
  }

  const commit = persistProjectBatch({
    projectId: state.project.projectId,
    startedAtNs: state.pendingStartNs,
    endedAtNs: nowNs(),
    eventCursorStart: state.firstCursor,
    eventCursorEnd: state.lastCursor,
    changes: Array.from(state.pendingChanges.values()),
    nextIndex: state.currentIndex,
    queueDepth: queueDepth(state),
    scanStats: state.scanStats,
  })

  if (commit) {
    console.log(
      `[cardinaldiff] commit #${commit.sequenceNo} (${commit.changeCount} changes) project=${state.project.name} ${formatDateTimeNs(commit.startedAtNs)} -> ${formatDateTimeNs(commit.endedAtNs)}`,
    )
  }

  state.pendingChanges.clear()
  state.pendingStartNs = null
  state.firstCursor = null
  state.scanStats = zeroStats()
  clearTimers(state)
}

const startProjectWatcher = (state: ProjectRuntimeState): void => {
  const parsed = parseStartCursor(state.project.lastEventCursor)
  const stop = watch(
    state.project.rootPath,
    parsed.since,
    (eventPath: string, flags: number, eventId: number | string) => {
      const info = getInfo(eventPath, flags)
      const rel = pathToRelative(state.project.rootPath, info.path)
      if (rel === null) {
        return
      }

      if (state.pendingStartNs === null) {
        state.pendingStartNs = nowNs()
        state.firstCursor = String(eventId)
      }
      state.lastCursor = String(eventId)

      if (shouldForceFullRescan(flags) || rel === '') {
        state.fullRescan = true
      } else {
        const candidate = normalizeDirtyPath(rel, info.type)
        state.dirtyPaths.add(candidate)
      }

      scheduleScan(state, () => {
        void runScan(state)
      })
      scheduleFlush(state, () => {
        void flushProject(state)
      })
    },
  )

  state.stopWatcher = stop
}

const stopProject = async (state: ProjectRuntimeState): Promise<void> => {
  try {
    await flushProject(state)
  } catch {
    // no-op
  }
  clearTimers(state)
  if (state.stopWatcher) {
    state.stopWatcher()
  }
}

export const runAgent = async (): Promise<void> => {
  if (process.platform !== 'darwin') {
    throw new Error('cardinaldiff agent is only supported on macOS')
  }

  fs.mkdirSync(logsDir, {recursive: true})

  const projects = listProjectsService().filter((project) => project.enabled)
  const states = projects
    .map((project) => createProjectState(project))
    .filter((state): state is ProjectRuntimeState => state !== null)

  for (const state of states) {
    try {
      startProjectWatcher(state)
      if (state.fullRescan) {
        state.pendingStartNs = nowNs()
        scheduleScan(state, () => {
          void runScan(state)
        })
        scheduleFlush(state, () => {
          void flushProject(state)
        })
      }
    } catch (error) {
      console.error(`[cardinaldiff] failed to start watcher for ${state.project.name}`, error)
    }
  }

  console.log(`[cardinaldiff] agent started for ${states.length} project(s)`)

  await new Promise<void>((resolve) => {
    let stopping = false
    const stop = (): void => {
      if (stopping) {
        return
      }
      stopping = true
      void (async () => {
        for (const state of states) {
          await stopProject(state)
        }
        resolve()
      })()
    }

    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

const resolveAgentWorkingDirectory = (): string => {
  const workspaceCandidate = path.join(repoRoot, 'cardinal-diff')
  if (fs.existsSync(path.join(workspaceCandidate, 'index.ts'))) {
    return workspaceCandidate
  }
  return process.cwd()
}

const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const getLaunchAgentProgram = (): {cwd: string; args: string[]} => ({
  cwd: resolveAgentWorkingDirectory(),
  args: ['/usr/bin/env', 'bun', 'run', 'index.ts', 'agent', 'run'],
})

export const installLaunchAgent = (): void => {
  const program = getLaunchAgentProgram()
  fs.mkdirSync(path.dirname(launchAgentPlistPath), {recursive: true})
  fs.mkdirSync(logsDir, {recursive: true})
  const stdoutPath = path.join(logsDir, 'agent.log')
  const stderrPath = path.join(logsDir, 'agent.error.log')

  const programArguments = program.args
    .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
    .join('\n')

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cardinaldiff.agent</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(program.cwd)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`

  fs.writeFileSync(launchAgentPlistPath, plist, 'utf8')
  console.log(`LaunchAgent written: ${launchAgentPlistPath}`)
  console.log(`Load with: launchctl load ${launchAgentPlistPath}`)
}

export const uninstallLaunchAgent = (): void => {
  if (fs.existsSync(launchAgentPlistPath)) {
    fs.rmSync(launchAgentPlistPath, {force: true})
  }
  console.log(`LaunchAgent removed: ${launchAgentPlistPath}`)
  console.log(`Unload (if loaded): launchctl unload ${launchAgentPlistPath}`)
}
