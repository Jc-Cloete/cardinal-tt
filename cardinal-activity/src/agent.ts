import { heartbeatIntervalMs, screenshotIntervalMs, windowPollMs } from './config'
import {
  getLatestHeartbeat,
  recordHeartbeat,
  recordScreenshotCapture,
  recordWindowSample,
} from './db'
import { activityLogger } from './observability'
import { captureScreenshot } from './screenshot'
import { readActiveWindowSample } from './window'

const agentLogger = activityLogger.child({ component: 'agent' })

const buildWindowSignature = (input: {
  appName: string
  windowTitle: string
  bundleId: string | null
  ownerPid: number | null
}): string =>
  `${input.appName}|${input.windowTitle}|${input.bundleId || ''}|${input.ownerPid || ''}`

export const runAgent = async (): Promise<void> => {
  const state = {
    lastWindowSignature: '',
    screenshotInProgress: false,
    windowInProgress: false,
  }

  const sampleWindow = async (): Promise<void> => {
    if (state.windowInProgress) {
      return
    }

    state.windowInProgress = true
    const observedAt = new Date().toISOString()
    try {
      const sample = await readActiveWindowSample(observedAt)
      if (!sample) {
        agentLogger.log({
          event: 'cardinal.activity.agent.window.sample.skipped',
          level: 'warn',
          fields: { reason: 'sample_unavailable' },
        })
        return
      }

      const signature = buildWindowSignature(sample)
      if (signature === state.lastWindowSignature) {
        return
      }

      recordWindowSample(sample)
      state.lastWindowSignature = signature
      agentLogger.log({
        event: 'cardinal.activity.agent.window.sample.recorded',
        fields: {
          observed_at: sample.observedAt,
          app_name: sample.appName,
          owner_pid: sample.ownerPid,
          has_window_title: sample.windowTitle.length > 0,
        },
      })
    } catch (error) {
      agentLogger.log({
        event: 'cardinal.activity.agent.window.sample.failed',
        level: 'error',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {
          observed_at: observedAt,
        },
      })
    } finally {
      state.windowInProgress = false
    }
  }

  const sampleScreenshot = async (): Promise<void> => {
    if (state.screenshotInProgress) {
      return
    }

    state.screenshotInProgress = true
    const observedAt = new Date().toISOString()
    try {
      const capture = await captureScreenshot(observedAt)
      if (!capture) {
        agentLogger.log({
          event: 'cardinal.activity.agent.screenshot.capture.skipped',
          level: 'warn',
          fields: {
            reason: 'capture_unavailable',
            observed_at: observedAt,
          },
        })
        return
      }

      recordScreenshotCapture(capture)
      agentLogger.log({
        event: 'cardinal.activity.agent.screenshot.capture.recorded',
        fields: {
          observed_at: capture.observedAt,
          asset_id: capture.assetId,
          bytes: capture.bytes,
          width: capture.width,
          height: capture.height,
        },
      })
    } catch (error) {
      agentLogger.log({
        event: 'cardinal.activity.agent.screenshot.capture.failed',
        level: 'error',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {
          observed_at: observedAt,
        },
      })
    } finally {
      state.screenshotInProgress = false
    }
  }

  const writeHeartbeat = (): void => {
    recordHeartbeat(process.pid)
    agentLogger.log({
      event: 'cardinal.activity.agent.heartbeat',
      fields: {
        agent_pid: process.pid,
      },
    })
  }

  agentLogger.log({
    event: 'cardinal.activity.agent.starting',
    fields: {
      pid: process.pid,
      window_poll_ms: windowPollMs,
      screenshot_interval_ms: screenshotIntervalMs,
      heartbeat_interval_ms: heartbeatIntervalMs,
      previous_heartbeat_at: getLatestHeartbeat()?.createdAt || null,
    },
  })

  writeHeartbeat()
  await sampleWindow()
  await sampleScreenshot()

  const windowTimer = setInterval(() => {
    void sampleWindow()
  }, windowPollMs)

  const screenshotTimer = setInterval(() => {
    void sampleScreenshot()
  }, screenshotIntervalMs)

  const heartbeatTimer = setInterval(() => {
    writeHeartbeat()
  }, heartbeatIntervalMs)

  const shutdown = (): void => {
    clearInterval(windowTimer)
    clearInterval(screenshotTimer)
    clearInterval(heartbeatTimer)

    agentLogger.log({
      event: 'cardinal.activity.agent.stopped',
      fields: {
        pid: process.pid,
      },
    })

    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await new Promise<void>(() => {
    // keep process alive while timers run
  })
}
