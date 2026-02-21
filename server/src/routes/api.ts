import fs from 'node:fs'
import path from 'node:path'
import {Router, type Request, type Response} from 'express'
import {ALL_PROJECTS, cacheDbPath, dataRoot} from '../config'
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
