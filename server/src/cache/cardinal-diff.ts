import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createCardinalStore,
  DEFAULT_IGNORE_PATTERNS,
  type HashPolicy,
  type JsonObject,
  type JsonValue,
  type ProjectMode,
} from 'cardinal-store'
import { cacheDbPath } from '../config'
import { serverLogger } from '../observability/logger'
import type {
  CardinalCommit,
  CardinalCommitEntry,
  CardinalDiffEntry,
  CardinalFileHistoryEntry,
  CardinalHeartbeatStatus,
  CardinalProject,
} from '../types'
import { asString } from '../utils/json'

const store = createCardinalStore(cacheDbPath)
const logger = serverLogger.child({ component: 'cardinal-cache' })

const asNumber = (value: JsonValue): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseJson = (value: string | null): JsonObject | null => {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as JsonValue
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as JsonObject
    }
  } catch {}
  return null
}

const toApiProject = (project: ReturnType<typeof store.listProjects>[number]): CardinalProject => ({
  projectId: project.projectId,
  name: project.name,
  rootPath: project.rootPath,
  enabled: project.enabled,
  mode: project.mode,
  hashPolicy: project.hashPolicy,
  updatedAt: '',
})

const toApiCommit = (commit: ReturnType<typeof store.listCommits>[number]): CardinalCommit => ({
  commitId: commit.commitId,
  projectId: commit.projectId,
  parentCommitId: commit.parentCommitId,
  sequenceNo: commit.sequenceNo,
  startedAtNs: commit.startedAtNs,
  endedAtNs: commit.endedAtNs,
  eventCursorStart: commit.eventCursorStart,
  eventCursorEnd: commit.eventCursorEnd,
  changeCount: commit.changeCount,
})

const toApiCommitEntry = (
  entry: ReturnType<typeof store.getCommitEntries>[number],
): CardinalCommitEntry => ({
  relPath: entry.relPath,
  op: entry.op,
  oldRelPath: entry.oldRelPath,
  before: parseJson(entry.beforeJson),
  after: parseJson(entry.afterJson),
  blobBefore: entry.blobBefore,
  blobAfter: entry.blobAfter,
})

export const listCardinalProjects = (): CardinalProject[] =>
  logger.run(
    {
      event: 'server.cardinal.projects.list',
    },
    () => store.listProjects().map(toApiProject),
  )

export const getCardinalProject = (projectId: string): CardinalProject | null =>
  logger.run(
    {
      event: 'server.cardinal.project.get',
      fields: {
        project_id: projectId,
      },
    },
    () => {
      const project = store.getProjectById(projectId)
      return project ? toApiProject(project) : null
    },
  )

export const getCardinalProjectByRootPath = (rootPath: string): CardinalProject | null =>
  logger.run(
    {
      event: 'server.cardinal.project.get_by_root',
      fields: {
        root_path: rootPath,
      },
    },
    () => {
      const project = store.getProjectByRootPath(rootPath)
      return project ? toApiProject(project) : null
    },
  )

export const addCardinalProject = (input: {
  name: string
  rootPath: string
  mode: ProjectMode
  hashPolicy: HashPolicy
  ignoreRules?: string[]
}): CardinalProject =>
  logger.run(
    {
      event: 'server.cardinal.project.add',
      fields: {
        name: input.name,
        root_path: input.rootPath,
        mode: input.mode,
        hash_policy: input.hashPolicy,
      },
    },
    () =>
      toApiProject(
        store.addProject({
          name: input.name,
          rootPath: input.rootPath,
          mode: input.mode,
          hashPolicy: input.hashPolicy,
          ignoreRules: input.ignoreRules?.length ? input.ignoreRules : [...DEFAULT_IGNORE_PATTERNS],
        }),
      ),
  )

export const removeCardinalProject = (projectId: string): void => {
  logger.run(
    {
      event: 'server.cardinal.project.remove',
      fields: {
        project_id: projectId,
      },
    },
    () => {
      store.removeProject(projectId)
      const projectFile = path.join(os.homedir(), '.cardinal-diff', 'projects', `${projectId}.json`)
      if (fs.existsSync(projectFile)) {
        fs.rmSync(projectFile, { force: true })
      }
    },
  )
}

export const listCardinalCommits = (args: {
  projectId?: string
  limit: number
  sinceNs?: number
  untilNs?: number
}): CardinalCommit[] =>
  logger.run(
    {
      event: 'server.cardinal.commits.list',
      fields: {
        project_id: args.projectId || '_all',
        limit: args.limit,
        since_ns: args.sinceNs ?? null,
        until_ns: args.untilNs ?? null,
      },
    },
    () => {
      if (!args.projectId) {
        const projects = store.listProjects()
        return projects
          .flatMap((project) =>
            store.listCommits({
              projectId: project.projectId,
              limit: args.limit,
              sinceNs: args.sinceNs,
              untilNs: args.untilNs,
            }),
          )
          .sort((a, b) => b.endedAtNs - a.endedAtNs)
          .slice(0, args.limit)
          .map(toApiCommit)
      }

      return store
        .listCommits({
          projectId: args.projectId,
          limit: args.limit,
          sinceNs: args.sinceNs,
          untilNs: args.untilNs,
        })
        .map(toApiCommit)
    },
  )

export const getCardinalCommit = (commitId: string): CardinalCommit | null =>
  logger.run(
    {
      event: 'server.cardinal.commit.get',
      fields: {
        commit_id: commitId,
      },
    },
    () => {
      const commit = store.getCommit(commitId)
      return commit ? toApiCommit(commit) : null
    },
  )

export const getCardinalCommitEntries = (commitId: string): CardinalCommitEntry[] =>
  logger.run(
    {
      event: 'server.cardinal.commit.entries.list',
      fields: {
        commit_id: commitId,
      },
    },
    () => store.getCommitEntries(commitId).map(toApiCommitEntry),
  )

export const getCardinalFileHistory = (
  projectId: string,
  relPath: string,
  limit: number,
): CardinalFileHistoryEntry[] =>
  logger.run(
    {
      event: 'server.cardinal.file_history.list',
      fields: {
        project_id: projectId,
        rel_path: relPath,
        limit,
      },
    },
    () =>
      store.getFileHistory({ projectId, relPath, limit }).map((row) => ({
        commitId: asString(row.commit_id) || '',
        relPath: asString(row.rel_path) || '',
        op: asString(row.op) || '',
        oldRelPath: asString(row.old_rel_path),
        before: parseJson(asString(row.before_json)),
        after: parseJson(asString(row.after_json)),
        sequenceNo: asNumber(row.sequence_no) ?? 0,
        startedAtNs: asNumber(row.started_at_ns) ?? 0,
        endedAtNs: asNumber(row.ended_at_ns) ?? 0,
        blobBefore: asString(row.blob_before),
        blobAfter: asString(row.blob_after),
      })),
  )

export const getCardinalDiffEntries = (args: {
  projectId: string
  fromSequence: number
  toSequence: number
  relPath?: string
}): CardinalDiffEntry[] =>
  logger.run(
    {
      event: 'server.cardinal.diff.range',
      fields: {
        project_id: args.projectId,
        from_sequence: args.fromSequence,
        to_sequence: args.toSequence,
        rel_path: args.relPath ?? null,
      },
    },
    () => {
      const commits = store.listCommitsBySequenceRange({
        projectId: args.projectId,
        fromSequence: args.fromSequence,
        toSequence: args.toSequence,
      })

      return commits.flatMap((commit) =>
        store
          .getCommitEntries(commit.commitId)
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
            before: parseJson(entry.beforeJson),
            after: parseJson(entry.afterJson),
            blobBefore: entry.blobBefore,
            blobAfter: entry.blobAfter,
            diffKind: 'metadata' as const,
            patch: null,
            patchTruncated: false,
          })),
      )
    },
  )

export const listCardinalEvents = (args: {
  projectId: string
  sinceNs: number
  untilNs: number
  limit: number
}): CardinalDiffEntry[] =>
  logger.run(
    {
      event: 'server.cardinal.events.list',
      fields: {
        project_id: args.projectId,
        since_ns: args.sinceNs,
        until_ns: args.untilNs,
        limit: args.limit,
      },
    },
    () => {
      const commits = store.listCommits({
        projectId: args.projectId,
        sinceNs: args.sinceNs,
        untilNs: args.untilNs,
        limit: args.limit,
      })

      return commits
        .flatMap((commit) =>
          store.getCommitEntries(commit.commitId).map((entry) => ({
            commitId: commit.commitId,
            sequenceNo: commit.sequenceNo,
            startedAtNs: commit.startedAtNs,
            endedAtNs: commit.endedAtNs,
            relPath: entry.relPath,
            op: entry.op,
            oldRelPath: entry.oldRelPath,
            before: parseJson(entry.beforeJson),
            after: parseJson(entry.afterJson),
            blobBefore: entry.blobBefore,
            blobAfter: entry.blobAfter,
            diffKind: 'metadata' as const,
            patch: null,
            patchTruncated: false,
          })),
        )
        .sort((a, b) => a.endedAtNs - b.endedAtNs)
        .slice(0, args.limit)
    },
  )

export const getCardinalHeartbeatStatus = (staleAfterSeconds: number): CardinalHeartbeatStatus =>
  logger.run(
    {
      event: 'server.cardinal.heartbeat.get',
      fields: {
        stale_after_seconds: staleAfterSeconds,
      },
    },
    () => {
      const latest = store.getLatestHeartbeat()
      if (!latest) {
        return {
          healthy: false,
          staleAfterSeconds,
          secondsSinceHeartbeat: null,
          lastHeartbeatAt: null,
          projectCount: null,
          agentPid: null,
        }
      }

      const deltaMs = Date.now() - Date.parse(latest.createdAt)
      const secondsSinceHeartbeat = Number.isFinite(deltaMs)
        ? Math.max(0, Math.floor(deltaMs / 1000))
        : null
      const healthy = secondsSinceHeartbeat !== null && secondsSinceHeartbeat <= staleAfterSeconds

      return {
        healthy,
        staleAfterSeconds,
        secondsSinceHeartbeat,
        lastHeartbeatAt: latest.createdAt,
        projectCount: latest.projectCount,
        agentPid: latest.agentPid,
      }
    },
  )
