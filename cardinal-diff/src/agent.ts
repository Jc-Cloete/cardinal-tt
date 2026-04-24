import fs from 'node:fs'
import path from 'node:path'
import { constants, getInfo, watch } from 'fsevents'
import { recordHeartbeat } from './db'
import { diffLogger } from './observability'
import { toPosixPath } from './path-utils'
import { launchAgentPlistPath, logsDir, repoRoot } from './paths'
import { mergePendingChanges } from './pending-buffer'
import {
  listProjectsService,
  loadProjectRuntime,
  persistProjectBatch,
  scanProjectDelta,
} from './service'
import type { ChangedEntry, IndexEntry, ProjectConfig, ScanStats } from './types'

const agentLogger = diffLogger.child({ component: 'agent' })

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

// Recover from stored cursors while handling invalid values safely.
const parseStartCursor = (cursor: string | null): { since: number; fullRescan: boolean } => {
  if (!cursor) {
    return { since: 0, fullRescan: false }
  }

  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { since: 0, fullRescan: true }
  }

  return { since: parsed, fullRescan: false }
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
    fullRescan: startCursor.fullRescan || runtime.index.size === 0,
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
  const startedAt = Date.now()

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

    agentLogger.log({
      event: 'cardinal.diff.agent.scan.complete',
      level: 'debug',
      fields: {
        project_id: state.project.projectId,
        project_name: state.project.name,
        full_rescan: false,
        changes_detected: result.changes.length,
        changed_scope_count: result.changedScopes.length,
        pending_change_count: state.pendingChanges.size,
        directories_scanned: result.scanStats.directoriesScanned,
        files_scanned: result.scanStats.filesScanned,
        scan_elapsed_ms: result.scanStats.elapsedMs,
        duration_ms: Date.now() - startedAt,
      },
    })
  } catch (error) {
    agentLogger.log({
      event: 'cardinal.diff.agent.scan.failed',
      level: 'error',
      outcome: 'error',
      error: error instanceof Error ? error : String(error),
      fields: {
        project_id: state.project.projectId,
        project_name: state.project.name,
        full_rescan: state.fullRescan,
        dirty_path_count: state.dirtyPaths.size,
        duration_ms: Date.now() - startedAt,
      },
    })
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

// Flush coalesced changes as a single immutable commit batch.
const flushProject = async (state: ProjectRuntimeState): Promise<void> => {
  const startedAt = Date.now()
  await runScan(state)

  if (state.pendingStartNs === null) {
    clearTimers(state)
    state.scanStats = zeroStats()
    agentLogger.log({
      event: 'cardinal.diff.agent.flush.skip',
      level: 'debug',
      fields: {
        project_id: state.project.projectId,
        project_name: state.project.name,
        reason: 'no_pending_window',
        duration_ms: Date.now() - startedAt,
      },
    })
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
    agentLogger.log({
      event: 'cardinal.diff.agent.flush.commit',
      fields: {
        project_id: state.project.projectId,
        project_name: state.project.name,
        commit_id: commit.commitId,
        sequence_no: commit.sequenceNo,
        change_count: commit.changeCount,
        started_at: formatDateTimeNs(commit.startedAtNs),
        ended_at: formatDateTimeNs(commit.endedAtNs),
        pending_change_count: state.pendingChanges.size,
        dirty_path_count: state.dirtyPaths.size,
        duration_ms: Date.now() - startedAt,
      },
    })
  } else {
    agentLogger.log({
      event: 'cardinal.diff.agent.flush.empty',
      level: 'debug',
      fields: {
        project_id: state.project.projectId,
        project_name: state.project.name,
        pending_change_count: state.pendingChanges.size,
        dirty_path_count: state.dirtyPaths.size,
        duration_ms: Date.now() - startedAt,
      },
    })
  }

  state.pendingChanges.clear()
  state.pendingStartNs = null
  state.firstCursor = null
  state.scanStats = zeroStats()
  clearTimers(state)
}

const startProjectWatcher = (state: ProjectRuntimeState): void => {
  const parsed = parseStartCursor(state.project.lastEventCursor)
  agentLogger.log({
    event: 'cardinal.diff.agent.watcher.starting',
    fields: {
      project_id: state.project.projectId,
      project_name: state.project.name,
      root_path: state.project.rootPath,
      since_cursor: state.project.lastEventCursor,
      since_event_id: parsed.since,
      full_rescan: parsed.fullRescan,
    },
  })
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
  agentLogger.log({
    event: 'cardinal.diff.agent.watcher.started',
    fields: {
      project_id: state.project.projectId,
      project_name: state.project.name,
      root_path: state.project.rootPath,
    },
  })
}

const stopProject = async (state: ProjectRuntimeState): Promise<void> => {
  agentLogger.log({
    event: 'cardinal.diff.agent.project.stop.requested',
    fields: {
      project_id: state.project.projectId,
      project_name: state.project.name,
    },
  })
  try {
    await flushProject(state)
  } catch {
    // no-op
  }
  clearTimers(state)
  if (state.stopWatcher) {
    state.stopWatcher()
  }
  agentLogger.log({
    event: 'cardinal.diff.agent.project.stopped',
    fields: {
      project_id: state.project.projectId,
      project_name: state.project.name,
    },
  })
}

export const runAgent = async (): Promise<void> => {
  if (process.platform !== 'darwin') {
    throw new Error('cardinaldiff agent is only supported on macOS')
  }

  agentLogger.log({
    event: 'cardinal.diff.agent.starting',
    fields: {
      pid: process.pid,
      platform: process.platform,
      node_env: process.env.NODE_ENV || 'development',
    },
  })

  fs.mkdirSync(logsDir, { recursive: true })

  const states = new Map<string, ProjectRuntimeState>()

  const scheduleInitialPass = (state: ProjectRuntimeState): void => {
    if (!state.fullRescan) {
      return
    }
    state.pendingStartNs = state.pendingStartNs ?? nowNs()
    scheduleScan(state, () => {
      void runScan(state)
    })
    scheduleFlush(state, () => {
      void flushProject(state)
    })
  }

  const syncProjects = async (): Promise<void> => {
    const startedAt = Date.now()
    const enabledProjects = listProjectsService().filter((project) => project.enabled)
    const nextIds = new Set(enabledProjects.map((project) => project.projectId))

    for (const [projectId, state] of states.entries()) {
      if (!nextIds.has(projectId)) {
        await stopProject(state)
        states.delete(projectId)
        agentLogger.log({
          event: 'cardinal.diff.agent.project.detached',
          fields: {
            project_id: projectId,
            project_name: state.project.name,
          },
        })
      }
    }

    for (const project of enabledProjects) {
      if (states.has(project.projectId)) {
        continue
      }

      const state = createProjectState(project)
      if (!state) {
        continue
      }

      try {
        startProjectWatcher(state)
        scheduleInitialPass(state)
        states.set(project.projectId, state)
        agentLogger.log({
          event: 'cardinal.diff.agent.project.attached',
          fields: {
            project_id: state.project.projectId,
            project_name: state.project.name,
            root_path: state.project.rootPath,
            initial_full_rescan: state.fullRescan,
          },
        })
      } catch (error) {
        agentLogger.log({
          event: 'cardinal.diff.agent.project.attach_failed',
          level: 'error',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            project_id: state.project.projectId,
            project_name: state.project.name,
            root_path: state.project.rootPath,
          },
        })
      }
    }

    agentLogger.log({
      event: 'cardinal.diff.agent.sync.complete',
      level: 'debug',
      fields: {
        enabled_project_count: enabledProjects.length,
        active_state_count: states.size,
        duration_ms: Date.now() - startedAt,
      },
    })
  }

  await syncProjects()

  const heartbeatTimer = setInterval(() => {
    recordHeartbeat({
      projectCount: states.size,
      agentPid: process.pid,
    })
    agentLogger.log({
      event: 'cardinal.diff.agent.heartbeat',
      fields: {
        project_count: states.size,
        agent_pid: process.pid,
      },
    })
  }, 15_000)

  const syncTimer = setInterval(() => {
    void syncProjects()
  }, 5_000)

  recordHeartbeat({
    projectCount: states.size,
    agentPid: process.pid,
  })
  agentLogger.log({
    event: 'cardinal.diff.agent.heartbeat',
    fields: {
      project_count: states.size,
      agent_pid: process.pid,
      initial: true,
    },
  })

  agentLogger.log({
    event: 'cardinal.diff.agent.started',
    fields: {
      project_count: states.size,
    },
  })

  await new Promise<void>((resolve) => {
    let stopping = false
    const stop = (): void => {
      if (stopping) {
        return
      }
      stopping = true
      agentLogger.log({
        event: 'cardinal.diff.agent.stop_requested',
        fields: {
          project_count: states.size,
        },
      })
      void (async () => {
        clearInterval(heartbeatTimer)
        clearInterval(syncTimer)
        for (const state of states.values()) {
          await stopProject(state)
        }
        agentLogger.log({
          event: 'cardinal.diff.agent.stopped',
          fields: {
            project_count: states.size,
          },
        })
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

const getLaunchAgentProgram = (): { cwd: string; args: string[] } => ({
  cwd: resolveAgentWorkingDirectory(),
  args: ['/usr/bin/env', 'bun', 'run', 'index.ts', 'agent', 'run'],
})

export const installLaunchAgent = (): void => {
  agentLogger.run(
    {
      event: 'cardinal.diff.agent.launch_agent.install',
      fields: {
        launch_agent_path: launchAgentPlistPath,
      },
    },
    () => {
      const program = getLaunchAgentProgram()
      fs.mkdirSync(path.dirname(launchAgentPlistPath), { recursive: true })
      fs.mkdirSync(logsDir, { recursive: true })
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
      agentLogger.log({
        event: 'cardinal.diff.agent.launch_agent.installed',
        fields: {
          launch_agent_path: launchAgentPlistPath,
          load_command: `launchctl load ${launchAgentPlistPath}`,
        },
      })
    },
  )
}

export const uninstallLaunchAgent = (): void => {
  agentLogger.run(
    {
      event: 'cardinal.diff.agent.launch_agent.uninstall',
      fields: {
        launch_agent_path: launchAgentPlistPath,
      },
    },
    () => {
      if (fs.existsSync(launchAgentPlistPath)) {
        fs.rmSync(launchAgentPlistPath, { force: true })
      }
      agentLogger.log({
        event: 'cardinal.diff.agent.launch_agent.uninstalled',
        fields: {
          launch_agent_path: launchAgentPlistPath,
          unload_command: `launchctl unload ${launchAgentPlistPath}`,
        },
      })
    },
  )
}
