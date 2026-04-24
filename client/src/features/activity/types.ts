export type ActivityWindowEvent = {
  eventId: string
  observedAt: string
  appName: string
  windowTitle: string
  bundleId: string | null
  ownerPid: number | null
}

export type ActivityScreenshotFrame = {
  frameId: string
  observedAt: string
  assetId: string
  bytes: number
  width: number | null
  height: number | null
  url: string
}

export type ActivityHeartbeat = {
  healthy: boolean
  staleAfterSeconds: number
  secondsSinceHeartbeat: number | null
  lastHeartbeatAt: string | null
  agentPid: number | null
}

export type ActivityWindowEventsResponse = {
  events: ActivityWindowEvent[]
}

export type ActivityScreenshotsResponse = {
  frames: ActivityScreenshotFrame[]
}

export type ActivityHeartbeatResponse = {
  heartbeat: ActivityHeartbeat
}
