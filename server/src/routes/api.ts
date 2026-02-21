import fs from 'node:fs'
import path from 'node:path'
import {Router, type Request, type Response} from 'express'
import {ALL_PROJECTS, cacheDbPath, dataRoot} from '../config'
import {
  getCardinalCommit,
  getCardinalCommitEntries,
  getCardinalDiffEntries,
  getCardinalFileHistory,
  getCardinalProject,
  listCardinalCommits,
  listCardinalProjects,
} from '../cache/cardinal-diff'
import {getDaySessions, getFilteredFileContent} from '../services/session-service'
import {readDir, resolveSafePath} from '../utils/fs-paths'
import {getConversationBreakLimitMinutes, isForceRefresh} from '../utils/requests'

export const apiRouter = Router()

apiRouter.get('/root', (_req: Request, res: Response) => {
  res.json({
    root: dataRoot,
    conversation_break_limit: getConversationBreakLimitMinutes(process.env.CONVERSATION_BREAK_LIMIT),
    cache_db_path: cacheDbPath,
  })
})

apiRouter.get('/years', (_req: Request, res: Response) => {
  const years = readDir(dataRoot)
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .sort()

  res.json({years})
})

apiRouter.get('/months', (req: Request, res: Response) => {
  const year = String(req.query.year ?? '')
  const yearDir = resolveSafePath(year)

  if (!fs.existsSync(yearDir)) {
    res.status(404).json({error: 'Year not found'})
    return
  }

  const months = readDir(yearDir)
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .sort()

  res.json({months})
})

apiRouter.get('/days', (req: Request, res: Response) => {
  const year = String(req.query.year ?? '')
  const month = String(req.query.month ?? '')
  const dayDir = resolveSafePath(path.join(year, month))

  if (!fs.existsSync(dayDir)) {
    res.status(404).json({error: 'Day path not found'})
    return
  }

  const days = readDir(dayDir)
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .sort()

  res.json({days})
})

apiRouter.get('/projects', (req: Request, res: Response) => {
  const year = String(req.query.year ?? '')
  const month = String(req.query.month ?? '')
  const day = String(req.query.day ?? '')
  const dayPath = resolveSafePath(path.join(year, month, day))

  if (!fs.existsSync(dayPath)) {
    res.status(404).json({error: 'Path not found'})
    return
  }

  const breakLimitMinutes = getConversationBreakLimitMinutes(
    req.query.conversation_break_limit ?? process.env.CONVERSATION_BREAK_LIMIT,
  )
  const forceRefresh = isForceRefresh(req.query.refresh)
  const sessions = getDaySessions(dayPath, breakLimitMinutes, forceRefresh)
  const projects = Array.from(new Set(sessions.map((session) => session.projectDir))).sort((a, b) =>
    a.localeCompare(b),
  )

  res.json({projects: [ALL_PROJECTS, ...projects]})
})

apiRouter.get('/files', (req: Request, res: Response) => {
  const year = String(req.query.year ?? '')
  const month = String(req.query.month ?? '')
  const day = String(req.query.day ?? '')
  const project = String(req.query.project ?? ALL_PROJECTS)
  const dayPath = resolveSafePath(path.join(year, month, day))

  if (!fs.existsSync(dayPath)) {
    res.status(404).json({error: 'Path not found'})
    return
  }

  const breakLimitMinutes = getConversationBreakLimitMinutes(
    req.query.conversation_break_limit ?? process.env.CONVERSATION_BREAK_LIMIT,
  )
  const forceRefresh = isForceRefresh(req.query.refresh)
  const sessions = getDaySessions(dayPath, breakLimitMinutes, forceRefresh)
  const files =
    project === ALL_PROJECTS
      ? sessions
      : sessions.filter((session) => session.projectDir === project)

  res.json({files})
})

apiRouter.get('/file', (req: Request, res: Response) => {
  const year = String(req.query.year ?? '')
  const month = String(req.query.month ?? '')
  const day = String(req.query.day ?? '')
  const file = String(req.query.file ?? '')
  const filePath = resolveSafePath(path.join(year, month, day, file))

  if (!fs.existsSync(filePath)) {
    res.status(404).json({error: 'File not found'})
    return
  }

  const forceRefresh = isForceRefresh(req.query.refresh)
  const content = getFilteredFileContent(filePath, forceRefresh)

  res.type('text/plain').send(content)
})

apiRouter.get('/cardinal/projects', (_req: Request, res: Response) => {
  res.json({projects: listCardinalProjects()})
})

apiRouter.get('/cardinal/commits', (req: Request, res: Response) => {
  const projectId = String(req.query.project_id ?? '')
  const rawSince = String(req.query.since_ns ?? '')
  const rawUntil = String(req.query.until_ns ?? '')
  const rawLimit = Number.parseInt(String(req.query.limit ?? '100'), 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 100
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
})

apiRouter.get('/cardinal/commit/:commitId', (req: Request, res: Response) => {
  const commitId = String(req.params.commitId ?? '')
  const commit = getCardinalCommit(commitId)
  if (!commit) {
    res.status(404).json({error: 'Commit not found'})
    return
  }

  res.json({
    commit,
    entries: getCardinalCommitEntries(commitId),
  })
})

apiRouter.get('/cardinal/file-history', (req: Request, res: Response) => {
  const projectId = String(req.query.project_id ?? '')
  const relPath = String(req.query.rel_path ?? '')
  if (!projectId || !relPath) {
    res.status(400).json({error: 'project_id and rel_path are required'})
    return
  }

  const rawLimit = Number.parseInt(String(req.query.limit ?? '200'), 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 200

  res.json({
    history: getCardinalFileHistory(projectId, relPath, limit),
  })
})

apiRouter.get('/cardinal/diff', (req: Request, res: Response) => {
  const projectId = String(req.query.project_id ?? '')
  const fromCommitId = String(req.query.from_commit_id ?? '')
  const toCommitId = String(req.query.to_commit_id ?? '')
  const relPath = String(req.query.rel_path ?? '')

  if (!projectId || !fromCommitId || !toCommitId) {
    res.status(400).json({error: 'project_id, from_commit_id and to_commit_id are required'})
    return
  }

  const project = getCardinalProject(projectId)
  if (!project) {
    res.status(404).json({error: 'Project not found'})
    return
  }

  const fromCommit = getCardinalCommit(fromCommitId)
  const toCommit = getCardinalCommit(toCommitId)
  if (!fromCommit || !toCommit) {
    res.status(404).json({error: 'One or both commits were not found'})
    return
  }

  if (fromCommit.projectId !== projectId || toCommit.projectId !== projectId) {
    res.status(400).json({error: 'Commits must belong to requested project'})
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
})
