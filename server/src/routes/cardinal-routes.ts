import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_IGNORE_PATTERNS, type HashPolicy, type ProjectMode } from 'cardinal-store'
import { type Request, type Response, Router } from 'express'
import {
  addCardinalProject,
  getCardinalCommit,
  getCardinalCommitEntries,
  getCardinalDiffEntries,
  getCardinalFileHistory,
  getCardinalHeartbeatStatus,
  getCardinalProject,
  getCardinalProjectByRootPath,
  listCardinalCommits,
  listCardinalEvents,
  listCardinalProjects,
  removeCardinalProject,
} from '../cache/cardinal-diff'
import { instrumentRoute, parseLimit } from './route-utils'

export const cardinalRouter = Router()

// Merge default ignore rules with optional per-project overrides.
const loadIgnoreRulesForProject = (rootPath: string): string[] => {
  const ignoreFile = path.join(rootPath, '.cardinaldiffignore')
  if (!fs.existsSync(ignoreFile)) {
    return [...DEFAULT_IGNORE_PATTERNS]
  }

  const customRules = fs
    .readFileSync(ignoreFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  return [...DEFAULT_IGNORE_PATTERNS, ...customRules]
}

cardinalRouter.get(
  '/cardinal/projects',
  instrumentRoute('server.api.cardinal.projects.list', (_req: Request, res: Response) => {
    res.json({ projects: listCardinalProjects() })
  }),
)

cardinalRouter.get(
  '/cardinal/project-by-root',
  instrumentRoute('server.api.cardinal.project_by_root.get', (req: Request, res: Response) => {
    const rootPath = String(req.query.root_path ?? '').trim()
    if (!rootPath) {
      res.status(400).json({ error: 'root_path is required' })
      return
    }

    const project = getCardinalProjectByRootPath(path.resolve(rootPath))
    res.json({ project })
  }),
)

cardinalRouter.post(
  '/cardinal/projects',
  instrumentRoute('server.api.cardinal.projects.create', (req: Request, res: Response) => {
    const rootPathRaw = String(req.body?.rootPath ?? req.body?.root_path ?? '').trim()
    if (!rootPathRaw) {
      res.status(400).json({ error: 'rootPath is required' })
      return
    }

    const rootPath = path.resolve(rootPathRaw)
    const home = path.resolve(os.homedir())
    const isInsideHome = rootPath === home || rootPath.startsWith(`${home}${path.sep}`)
    if (!isInsideHome) {
      res.status(400).json({ error: `Project path must be inside ${home}` })
      return
    }

    if (!fs.existsSync(rootPath) || !fs.lstatSync(rootPath).isDirectory()) {
      res.status(400).json({ error: 'Project path must exist and be a directory' })
      return
    }

    const modeRaw = String(req.body?.mode ?? 'metadata')
    const hashPolicyRaw = String(req.body?.hashPolicy ?? req.body?.hash_policy ?? 'off')
    const mode: ProjectMode = modeRaw === 'content' ? 'content' : 'metadata'
    const hashPolicy: HashPolicy = hashPolicyRaw === 'on_change' ? 'on_change' : 'off'
    const name = String(req.body?.name ?? path.basename(rootPath)).trim() || path.basename(rootPath)

    const existing = getCardinalProjectByRootPath(rootPath)
    if (existing) {
      res.json({ project: existing, created: false })
      return
    }

    const project = addCardinalProject({
      name,
      rootPath,
      mode,
      hashPolicy,
      ignoreRules: loadIgnoreRulesForProject(rootPath),
    })

    res.status(201).json({ project, created: true })
  }),
)

cardinalRouter.delete(
  '/cardinal/projects/:projectId',
  instrumentRoute('server.api.cardinal.projects.delete', (req: Request, res: Response) => {
    const projectId = String(req.params.projectId ?? '').trim()
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' })
      return
    }

    removeCardinalProject(projectId)
    res.json({ ok: true, projectId })
  }),
)

cardinalRouter.get(
  '/cardinal/commits',
  instrumentRoute('server.api.cardinal.commits.list', (req: Request, res: Response) => {
    const projectId = String(req.query.project_id ?? '')
    const rawSince = String(req.query.since_ns ?? '')
    const rawUntil = String(req.query.until_ns ?? '')
    const limit = parseLimit(req.query.limit, 100, 1000)
    const sinceNs = rawSince ? Number.parseInt(rawSince, 10) : undefined
    const untilNs = rawUntil ? Number.parseInt(rawUntil, 10) : undefined

    res.json({
      commits: listCardinalCommits({
        projectId,
        limit,
        sinceNs: Number.isFinite(sinceNs ?? NaN) ? sinceNs : undefined,
        untilNs: Number.isFinite(untilNs ?? NaN) ? untilNs : undefined,
      }),
    })
  }),
)

cardinalRouter.get(
  '/cardinal/commit/:commitId',
  instrumentRoute('server.api.cardinal.commit.get', (req: Request, res: Response) => {
    const commitId = String(req.params.commitId ?? '')
    const commit = getCardinalCommit(commitId)
    if (!commit) {
      res.status(404).json({ error: 'Commit not found' })
      return
    }

    res.json({
      commit,
      entries: getCardinalCommitEntries(commitId),
    })
  }),
)

cardinalRouter.get(
  '/cardinal/file-history',
  instrumentRoute('server.api.cardinal.file_history.list', (req: Request, res: Response) => {
    const projectId = String(req.query.project_id ?? '')
    const relPath = String(req.query.rel_path ?? '')
    if (!projectId || !relPath) {
      res.status(400).json({ error: 'project_id and rel_path are required' })
      return
    }

    res.json({
      history: getCardinalFileHistory(projectId, relPath, parseLimit(req.query.limit, 200, 1000)),
    })
  }),
)

cardinalRouter.get(
  '/cardinal/diff',
  instrumentRoute('server.api.cardinal.diff.get', (req: Request, res: Response) => {
    const projectId = String(req.query.project_id ?? '')
    const fromCommitId = String(req.query.from_commit_id ?? '')
    const toCommitId = String(req.query.to_commit_id ?? '')
    const relPath = String(req.query.rel_path ?? '')

    if (!projectId || !fromCommitId || !toCommitId) {
      res.status(400).json({ error: 'project_id, from_commit_id and to_commit_id are required' })
      return
    }

    const project = getCardinalProject(projectId)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const fromCommit = getCardinalCommit(fromCommitId)
    const toCommit = getCardinalCommit(toCommitId)
    if (!fromCommit || !toCommit) {
      res.status(404).json({ error: 'One or both commits were not found' })
      return
    }

    if (fromCommit.projectId !== projectId || toCommit.projectId !== projectId) {
      res.status(400).json({ error: 'Commits must belong to requested project' })
      return
    }

    const entries = getCardinalDiffEntries({
      projectId,
      fromSequence: fromCommit.sequenceNo,
      toSequence: toCommit.sequenceNo,
      relPath: relPath || undefined,
    })

    res.json({
      project,
      fromCommit,
      toCommit,
      entryCount: entries.length,
      entries,
    })
  }),
)

cardinalRouter.get(
  '/cardinal/events',
  instrumentRoute('server.api.cardinal.events.list', (req: Request, res: Response) => {
    const projectId = String(req.query.project_id ?? '').trim()
    if (!projectId) {
      res.status(400).json({ error: 'project_id is required' })
      return
    }

    const sinceNs = Number.parseInt(String(req.query.since_ns ?? ''), 10)
    const untilNs = Number.parseInt(String(req.query.until_ns ?? ''), 10)
    if (!Number.isFinite(sinceNs) || !Number.isFinite(untilNs)) {
      res.status(400).json({ error: 'since_ns and until_ns are required' })
      return
    }

    const fromNs = Math.min(sinceNs, untilNs)
    const toNs = Math.max(sinceNs, untilNs)

    const events = listCardinalEvents({
      projectId,
      sinceNs: fromNs,
      untilNs: toNs,
      limit: parseLimit(req.query.limit, 1000, 5000),
    })

    res.json({ events })
  }),
)

cardinalRouter.get(
  '/cardinal/heartbeat',
  instrumentRoute('server.api.cardinal.heartbeat.get', (_req: Request, res: Response) => {
    res.json({
      heartbeat: getCardinalHeartbeatStatus(45),
    })
  }),
)
