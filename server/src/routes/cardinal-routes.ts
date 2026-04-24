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
import {
  failValidation,
  readBoundedInteger,
  readOptionalInteger,
  readOptionalString,
  readRequiredInteger,
  readRequiredString,
} from '../utils/validation'
import { instrumentRoute } from './route-utils'

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
    const rootPath = readRequiredString(req.query, 'root_path', 'root_path is required')
    const project = getCardinalProjectByRootPath(path.resolve(rootPath))
    res.json({ project })
  }),
)

cardinalRouter.post(
  '/cardinal/projects',
  instrumentRoute('server.api.cardinal.projects.create', (req: Request, res: Response) => {
    const rootPathRaw = readRequiredString(
      req.body,
      ['rootPath', 'root_path'],
      'rootPath is required',
    )

    const rootPath = path.resolve(rootPathRaw)
    const home = path.resolve(os.homedir())
    const isInsideHome = rootPath === home || rootPath.startsWith(`${home}${path.sep}`)
    if (!isInsideHome) {
      failValidation(`Project path must be inside ${home}`)
    }

    if (!fs.existsSync(rootPath) || !fs.lstatSync(rootPath).isDirectory()) {
      failValidation('Project path must exist and be a directory')
    }

    const modeRaw = readOptionalString(req.body, 'mode', 'metadata')
    const hashPolicyRaw = readOptionalString(req.body, ['hashPolicy', 'hash_policy'], 'off')
    const mode: ProjectMode = modeRaw === 'content' ? 'content' : 'metadata'
    const hashPolicy: HashPolicy = hashPolicyRaw === 'on_change' ? 'on_change' : 'off'
    const name = readOptionalString(req.body, 'name', path.basename(rootPath))

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
    const projectId = readRequiredString(req.params, 'projectId', 'projectId is required')
    removeCardinalProject(projectId)
    res.json({ ok: true, projectId })
  }),
)

cardinalRouter.get(
  '/cardinal/commits',
  instrumentRoute('server.api.cardinal.commits.list', (req: Request, res: Response) => {
    const projectId = readOptionalString(req.query, 'project_id')
    const limit = readBoundedInteger(req.query.limit, 100, 1, 1000)
    const sinceNs = readOptionalInteger(req.query, 'since_ns')
    const untilNs = readOptionalInteger(req.query, 'until_ns')

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
    const commitId = readOptionalString(req.params, 'commitId')
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
    const projectId = readRequiredString(
      req.query,
      'project_id',
      'project_id and rel_path are required',
    )
    const relPath = readRequiredString(
      req.query,
      'rel_path',
      'project_id and rel_path are required',
    )

    res.json({
      history: getCardinalFileHistory(
        projectId,
        relPath,
        readBoundedInteger(req.query.limit, 200, 1, 1000),
      ),
    })
  }),
)

cardinalRouter.get(
  '/cardinal/diff',
  instrumentRoute('server.api.cardinal.diff.get', (req: Request, res: Response) => {
    const projectId = readRequiredString(
      req.query,
      'project_id',
      'project_id, from_commit_id and to_commit_id are required',
    )
    const fromCommitId = readRequiredString(
      req.query,
      'from_commit_id',
      'project_id, from_commit_id and to_commit_id are required',
    )
    const toCommitId = readRequiredString(
      req.query,
      'to_commit_id',
      'project_id, from_commit_id and to_commit_id are required',
    )
    const relPath = readOptionalString(req.query, 'rel_path')

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
      failValidation('Commits must belong to requested project')
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
    const projectId = readRequiredString(req.query, 'project_id', 'project_id is required')
    const sinceNs = readRequiredInteger(req.query, 'since_ns', 'since_ns and until_ns are required')
    const untilNs = readRequiredInteger(req.query, 'until_ns', 'since_ns and until_ns are required')

    const fromNs = Math.min(sinceNs, untilNs)
    const toNs = Math.max(sinceNs, untilNs)

    const events = listCardinalEvents({
      projectId,
      sinceNs: fromNs,
      untilNs: toNs,
      limit: readBoundedInteger(req.query.limit, 1000, 1, 5000),
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
