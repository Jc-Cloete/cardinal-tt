import fs from 'node:fs'
import path from 'node:path'
import { type Request, type Response, Router } from 'express'
import { ALL_PROJECTS, cacheDbPath, dataRoot } from '../config'
import { serverLogger } from '../observability/logger'
import { getDaySessions, getFilteredFileContent } from '../services/session-service'
import { readDir, resolveSafePath } from '../utils/fs-paths'
import { getConversationBreakLimitMinutes, isForceRefresh } from '../utils/requests'
import { failValidation, readOptionalString } from '../utils/validation'
import { instrumentRoute, toRouteFields } from './route-utils'

export const sessionRouter = Router()

sessionRouter.get(
  '/root',
  instrumentRoute('server.api.root.get', (_req: Request, res: Response) => {
    res.json({
      root: dataRoot,
      conversation_break_limit: getConversationBreakLimitMinutes(
        process.env.CONVERSATION_BREAK_LIMIT,
      ),
      cache_db_path: cacheDbPath,
    })
  }),
)

sessionRouter.get(
  '/years',
  instrumentRoute('server.api.years.list', (_req: Request, res: Response) => {
    const years = readDir(dataRoot)
      .filter((entry) => entry.type === 'dir')
      .map((entry) => entry.name)
      .sort()

    res.json({ years })
  }),
)

sessionRouter.get(
  '/months',
  instrumentRoute('server.api.months.list', (req: Request, res: Response) => {
    const year = readOptionalString(req.query, 'year')
    serverLogger.log({
      event: 'server.api.months.query',
      fields: toRouteFields({ year }),
    })
    const yearDir = resolveSafePath(year)

    if (!fs.existsSync(yearDir)) {
      res.status(404).json({ error: 'Year not found' })
      return
    }

    const months = readDir(yearDir)
      .filter((entry) => entry.type === 'dir')
      .map((entry) => entry.name)
      .sort()

    res.json({ months })
  }),
)

sessionRouter.get(
  '/days',
  instrumentRoute('server.api.days.list', (req: Request, res: Response) => {
    const year = readOptionalString(req.query, 'year')
    const month = readOptionalString(req.query, 'month')
    serverLogger.log({
      event: 'server.api.days.query',
      fields: toRouteFields({ year, month }),
    })
    const dayDir = resolveSafePath(path.join(year, month))

    if (!fs.existsSync(dayDir)) {
      res.status(404).json({ error: 'Day path not found' })
      return
    }

    const days = readDir(dayDir)
      .filter((entry) => entry.type === 'dir')
      .map((entry) => entry.name)
      .sort()

    res.json({ days })
  }),
)

sessionRouter.get(
  '/projects',
  instrumentRoute('server.api.projects.list', (req: Request, res: Response) => {
    const year = readOptionalString(req.query, 'year')
    const month = readOptionalString(req.query, 'month')
    const day = readOptionalString(req.query, 'day')
    const dayPath = resolveSafePath(path.join(year, month, day))

    if (!fs.existsSync(dayPath)) {
      res.status(404).json({ error: 'Path not found' })
      return
    }

    const breakLimitMinutes = getConversationBreakLimitMinutes(
      req.query.conversation_break_limit ?? process.env.CONVERSATION_BREAK_LIMIT,
    )
    const forceRefresh = isForceRefresh(req.query.refresh)
    serverLogger.log({
      event: 'server.api.projects.query',
      fields: toRouteFields({
        year,
        month,
        day,
        break_limit_minutes: breakLimitMinutes,
        force_refresh: forceRefresh,
      }),
    })
    const sessions = getDaySessions(dayPath, breakLimitMinutes, forceRefresh)
    const projects = Array.from(new Set(sessions.map((session) => session.projectDir))).sort(
      (a, b) => a.localeCompare(b),
    )

    res.json({ projects: [ALL_PROJECTS, ...projects] })
  }),
)

sessionRouter.get(
  '/files',
  instrumentRoute('server.api.files.list', (req: Request, res: Response) => {
    const year = readOptionalString(req.query, 'year')
    const month = readOptionalString(req.query, 'month')
    const day = readOptionalString(req.query, 'day')
    const project = readOptionalString(req.query, 'project', ALL_PROJECTS)
    const dayPath = resolveSafePath(path.join(year, month, day))

    if (!fs.existsSync(dayPath)) {
      res.status(404).json({ error: 'Path not found' })
      return
    }

    const breakLimitMinutes = getConversationBreakLimitMinutes(
      req.query.conversation_break_limit ?? process.env.CONVERSATION_BREAK_LIMIT,
    )
    const forceRefresh = isForceRefresh(req.query.refresh)
    serverLogger.log({
      event: 'server.api.files.query',
      fields: toRouteFields({
        year,
        month,
        day,
        project,
        break_limit_minutes: breakLimitMinutes,
        force_refresh: forceRefresh,
      }),
    })
    const sessions = getDaySessions(dayPath, breakLimitMinutes, forceRefresh)
    const files =
      project === ALL_PROJECTS
        ? sessions
        : sessions.filter((session) => session.projectDir === project)

    res.json({ files })
  }),
)

sessionRouter.get(
  '/file',
  instrumentRoute('server.api.file.get', (req: Request, res: Response) => {
    const relativePath = readOptionalString(req.query, 'relative_path')
    const year = readOptionalString(req.query, 'year')
    const month = readOptionalString(req.query, 'month')
    const day = readOptionalString(req.query, 'day')
    const file = readOptionalString(req.query, 'file')
    const fallbackPath = path.join(year, month, day, file)
    if (!relativePath && !file.trim()) {
      failValidation('relative_path or file is required')
    }
    const resolvedRelativePath = relativePath || fallbackPath
    const filePath = resolveSafePath(resolvedRelativePath)

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    const forceRefresh = isForceRefresh(req.query.refresh)
    serverLogger.log({
      event: 'server.api.file.query',
      fields: toRouteFields({
        relative_path: relativePath || null,
        year,
        month,
        day,
        file,
        force_refresh: forceRefresh,
      }),
    })
    const content = getFilteredFileContent(filePath, forceRefresh)

    res.type('text/plain').send(content)
  }),
)
