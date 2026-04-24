import { randomUUID } from 'node:crypto'
import {
  type ActivityScreenshotFrame,
  type ActivityWindowEvent,
  createCardinalStore,
} from 'cardinal-store'
import { cacheDbPath, ensureDirectories } from './config'
import { activityLogger } from './observability'
import type { ScreenshotAssetCapture, WindowSample } from './types'

const dbLogger = activityLogger.child({
  component: 'db',
  db_path: cacheDbPath,
})

ensureDirectories()

dbLogger.log({
  event: 'cardinal.activity.db.directories.ensure',
  fields: {
    cache_db_path: cacheDbPath,
  },
})

const store = createCardinalStore(cacheDbPath)

export const recordWindowSample = (sample: WindowSample): void => {
  const event: ActivityWindowEvent = {
    eventId: randomUUID(),
    observedAt: sample.observedAt,
    appName: sample.appName,
    windowTitle: sample.windowTitle,
    bundleId: sample.bundleId,
    ownerPid: sample.ownerPid,
  }

  store.insertActivityWindowEvent(event)
}

export const recordScreenshotCapture = (capture: ScreenshotAssetCapture): void => {
  store.upsertActivityScreenshotAsset({
    assetId: capture.assetId,
    sha256: capture.sha256,
    storagePath: capture.storagePath,
    bytes: capture.bytes,
    width: capture.width,
    height: capture.height,
    createdAt: capture.observedAt,
  })

  const frame: ActivityScreenshotFrame = {
    frameId: randomUUID(),
    observedAt: capture.observedAt,
    assetId: capture.assetId,
  }
  store.insertActivityScreenshotFrame(frame)
}

export const recordHeartbeat = (agentPid: number): void => {
  store.recordActivityHeartbeat({ agentPid })
}

export const getLatestHeartbeat = () => store.getLatestActivityHeartbeat()
