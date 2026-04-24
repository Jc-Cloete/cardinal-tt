import { createCardinalStore } from 'cardinal-store'
import { cacheDbPath } from '../config'
import { serverLogger } from '../observability/logger'
import type {
  ActivityHeartbeatStatus,
  ActivityScreenshotFrame,
  ActivityWindowEvent,
} from '../types'

const store = createCardinalStore(cacheDbPath)
const logger = serverLogger.child({ component: 'activity-cache' })

export const listActivityWindowEvents = (args: {
  fromIso: string
  toIso: string
  limit: number
}): ActivityWindowEvent[] =>
  logger.run(
    {
      event: 'server.activity.window_events.list',
      fields: {
        from_iso: args.fromIso,
        to_iso: args.toIso,
        limit: args.limit,
      },
    },
    () => store.listActivityWindowEvents(args),
  )

export const listActivityScreenshotFrames = (args: {
  fromIso: string
  toIso: string
  limit: number
}): ActivityScreenshotFrame[] =>
  logger.run(
    {
      event: 'server.activity.screenshot_frames.list',
      fields: {
        from_iso: args.fromIso,
        to_iso: args.toIso,
        limit: args.limit,
      },
    },
    () => {
      const frames = store.listActivityScreenshotFrames(args)

      return frames.flatMap((frame) => {
        const asset = store.getActivityScreenshotAssetById(frame.assetId)
        if (!asset) {
          return []
        }

        return {
          frameId: frame.frameId,
          observedAt: frame.observedAt,
          assetId: frame.assetId,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
          url: `/api/activity/screenshots/${encodeURIComponent(frame.assetId)}`,
        }
      })
    },
  )

export const getActivityScreenshotPath = (assetId: string): string | null =>
  logger.run(
    {
      event: 'server.activity.screenshot.get_path',
      fields: {
        asset_id: assetId,
      },
      level: 'debug',
    },
    () => {
      const asset = store.getActivityScreenshotAssetById(assetId)
      return asset?.storagePath || null
    },
  )

export const getActivityHeartbeatStatus = (staleAfterSeconds: number): ActivityHeartbeatStatus =>
  logger.run(
    {
      event: 'server.activity.heartbeat.get',
      fields: {
        stale_after_seconds: staleAfterSeconds,
      },
    },
    () => {
      const latest = store.getLatestActivityHeartbeat()
      if (!latest) {
        return {
          healthy: false,
          staleAfterSeconds,
          secondsSinceHeartbeat: null,
          lastHeartbeatAt: null,
          agentPid: null,
        }
      }

      const deltaMs = Date.now() - Date.parse(latest.createdAt)
      const secondsSinceHeartbeat = Number.isFinite(deltaMs)
        ? Math.max(0, Math.floor(deltaMs / 1000))
        : null

      return {
        healthy: secondsSinceHeartbeat !== null && secondsSinceHeartbeat <= staleAfterSeconds,
        staleAfterSeconds,
        secondsSinceHeartbeat,
        lastHeartbeatAt: latest.createdAt,
        agentPid: latest.agentPid,
      }
    },
  )
