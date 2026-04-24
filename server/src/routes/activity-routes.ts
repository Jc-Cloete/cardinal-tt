import fs from 'node:fs'
import path from 'node:path'
import { type Request, type Response, Router } from 'express'
import {
  getActivityHeartbeatStatus,
  getActivityScreenshotPath,
  listActivityScreenshotFrames,
  listActivityWindowEvents,
} from '../cache/activity'
import { activityDataDir } from '../config'
import { readBoundedInteger, readRequiredIsoRange, readRequiredString } from '../utils/validation'
import { instrumentRoute } from './route-utils'

export const activityRouter = Router()

activityRouter.get(
  '/activity/window-events',
  instrumentRoute('server.api.activity.window_events.list', (req: Request, res: Response) => {
    const parsedRange = readRequiredIsoRange(
      req.query,
      'from',
      'to',
      'from and to must be valid ISO timestamps',
    )
    const limit = readBoundedInteger(req.query.limit, 1000, 1, 10000)
    const events = listActivityWindowEvents({
      fromIso: parsedRange.fromIso,
      toIso: parsedRange.toIso,
      limit,
    })

    res.json({ events })
  }),
)

activityRouter.get(
  '/activity/screenshots',
  instrumentRoute('server.api.activity.screenshots.list', (req: Request, res: Response) => {
    const parsedRange = readRequiredIsoRange(
      req.query,
      'from',
      'to',
      'from and to must be valid ISO timestamps',
    )
    const limit = readBoundedInteger(req.query.limit, 1000, 1, 10000)
    const frames = listActivityScreenshotFrames({
      fromIso: parsedRange.fromIso,
      toIso: parsedRange.toIso,
      limit,
    })

    res.json({ frames })
  }),
)

activityRouter.get(
  '/activity/screenshots/:assetId',
  instrumentRoute('server.api.activity.screenshot.get', (req: Request, res: Response) => {
    const assetId = readRequiredString(req.params, 'assetId', 'assetId is required')

    const storagePath = getActivityScreenshotPath(assetId)
    const resolvedStoragePath = storagePath ? path.resolve(storagePath) : ''
    const resolvedActivityRoot = path.resolve(activityDataDir)
    const isInsideActivityRoot =
      resolvedStoragePath === resolvedActivityRoot ||
      resolvedStoragePath.startsWith(`${resolvedActivityRoot}${path.sep}`)

    if (
      !storagePath ||
      !isInsideActivityRoot ||
      !fs.existsSync(resolvedStoragePath) ||
      fs.statSync(resolvedStoragePath).isDirectory()
    ) {
      res.status(404).json({ error: 'Screenshot not found' })
      return
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.sendFile(resolvedStoragePath)
  }),
)

activityRouter.get(
  '/activity/heartbeat',
  instrumentRoute('server.api.activity.heartbeat.get', (_req: Request, res: Response) => {
    res.json({
      heartbeat: getActivityHeartbeatStatus(45),
    })
  }),
)
