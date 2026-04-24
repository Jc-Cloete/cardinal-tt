import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../constants'
import { useToast } from '../../notifications/ToastProvider'
import { clientLogger } from '../../observability/logger'
import { dateTimeToIso, getTodayDate } from '../../utils/date'
import { fetchJson } from '../../utils/fetch'
import type {
  ActivityHeartbeat,
  ActivityHeartbeatResponse,
  ActivityScreenshotFrame,
  ActivityScreenshotsResponse,
  ActivityWindowEvent,
  ActivityWindowEventsResponse,
} from './types'

const activityLogger = clientLogger.child({ component: 'use-activity' })

type UseActivityResult = {
  day: string
  fromTime: string
  toTime: string
  limit: string
  loading: boolean
  frames: ActivityScreenshotFrame[]
  windowEvents: ActivityWindowEvent[]
  selectedFrameIndex: number
  selectedFrame: ActivityScreenshotFrame | null
  nearestWindowEvent: ActivityWindowEvent | null
  heartbeat: ActivityHeartbeat | null
  setDay: (value: string) => void
  setFromTime: (value: string) => void
  setToTime: (value: string) => void
  setLimit: (value: string) => void
  setSelectedFrameIndex: (value: number) => void
  reload: (notify?: boolean) => Promise<void>
}

export const useActivity = (): UseActivityResult => {
  const { success: showSuccessToast, warning: showWarningToast, error: showErrorToast } = useToast()
  const [day, setDay] = useState<string>(getTodayDate())
  const [fromTime, setFromTime] = useState<string>('00:00')
  const [toTime, setToTime] = useState<string>('23:59')
  const [limit, setLimit] = useState<string>('2000')
  const [loading, setLoading] = useState<boolean>(false)
  const [frames, setFrames] = useState<ActivityScreenshotFrame[]>([])
  const [windowEvents, setWindowEvents] = useState<ActivityWindowEvent[]>([])
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0)
  const [heartbeat, setHeartbeat] = useState<ActivityHeartbeat | null>(null)

  const rangeIso = useMemo(
    () => ({
      fromIso: dateTimeToIso(day, fromTime),
      toIso: dateTimeToIso(day, toTime),
    }),
    [day, fromTime, toTime],
  )

  const selectedFrame = useMemo<ActivityScreenshotFrame | null>(
    () => frames[selectedFrameIndex] || null,
    [frames, selectedFrameIndex],
  )

  const nearestWindowEvent = useMemo<ActivityWindowEvent | null>(() => {
    if (!selectedFrame || windowEvents.length === 0) {
      return null
    }

    const frameMs = Date.parse(selectedFrame.observedAt)
    if (!Number.isFinite(frameMs)) {
      return windowEvents[windowEvents.length - 1] || null
    }

    let nearest: ActivityWindowEvent | null = null
    for (const event of windowEvents) {
      const eventMs = Date.parse(event.observedAt)
      if (!Number.isFinite(eventMs)) {
        continue
      }

      if (eventMs <= frameMs) {
        nearest = event
        continue
      }

      if (!nearest) {
        return event
      }
      break
    }

    return nearest || windowEvents[windowEvents.length - 1] || null
  }, [selectedFrame, windowEvents])

  const reload = useCallback(
    async (notify: boolean = false): Promise<void> => {
      if (!rangeIso.fromIso || !rangeIso.toIso) {
        setFrames([])
        setWindowEvents([])
        if (notify) {
          showWarningToast('Invalid range', 'Choose a valid date/time range first.')
        }
        return
      }

      const parsedLimit = Number.parseInt(limit, 10)
      const boundedLimit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, 10_000))
        : 2000

      setLoading(true)
      try {
        const [screenshotsResponse, windowEventsResponse, heartbeatResponse] = await Promise.all([
          fetchJson<ActivityScreenshotsResponse>(
            `${API}/activity/screenshots?from=${encodeURIComponent(rangeIso.fromIso)}&to=${encodeURIComponent(rangeIso.toIso)}&limit=${encodeURIComponent(String(boundedLimit))}`,
          ),
          fetchJson<ActivityWindowEventsResponse>(
            `${API}/activity/window-events?from=${encodeURIComponent(rangeIso.fromIso)}&to=${encodeURIComponent(rangeIso.toIso)}&limit=${encodeURIComponent(String(boundedLimit))}`,
          ),
          fetchJson<ActivityHeartbeatResponse>(`${API}/activity/heartbeat`),
        ])

        const nextFrames = Array.isArray(screenshotsResponse.frames)
          ? screenshotsResponse.frames
          : []
        const nextWindowEvents = Array.isArray(windowEventsResponse.events)
          ? windowEventsResponse.events
          : []

        setFrames(nextFrames)
        setWindowEvents(nextWindowEvents)
        setHeartbeat(heartbeatResponse.heartbeat || null)
        setSelectedFrameIndex((prev) => {
          if (nextFrames.length === 0) {
            return 0
          }
          return Math.max(0, Math.min(prev, nextFrames.length - 1))
        })

        activityLogger.log({
          event: 'client.activity.reload.success',
          fields: {
            from_iso: rangeIso.fromIso,
            to_iso: rangeIso.toIso,
            frame_count: nextFrames.length,
            window_event_count: nextWindowEvents.length,
            limit: boundedLimit,
          },
        })

        if (notify) {
          showSuccessToast('Activity refreshed', `${nextFrames.length} screenshot frames loaded.`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '')
        setFrames([])
        setWindowEvents([])
        activityLogger.log({
          event: 'client.activity.reload.failed',
          level: 'error',
          outcome: 'error',
          error: message,
          fields: {
            from_iso: rangeIso.fromIso,
            to_iso: rangeIso.toIso,
          },
        })

        if (notify) {
          showErrorToast('Activity refresh failed', message)
        }
      } finally {
        setLoading(false)
      }
    },
    [limit, rangeIso.fromIso, rangeIso.toIso, showErrorToast, showSuccessToast, showWarningToast],
  )

  useEffect(() => {
    void reload(false)
  }, [reload])

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchJson<ActivityHeartbeatResponse>(`${API}/activity/heartbeat`)
        .then((response) => {
          setHeartbeat(response.heartbeat || null)
        })
        .catch(() => {
          setHeartbeat(null)
        })
    }, 15000)

    return () => clearInterval(timer)
  }, [])

  return {
    day,
    fromTime,
    toTime,
    limit,
    loading,
    frames,
    windowEvents,
    selectedFrameIndex,
    selectedFrame,
    nearestWindowEvent,
    heartbeat,
    setDay,
    setFromTime,
    setToTime,
    setLimit,
    setSelectedFrameIndex,
    reload,
  }
}
