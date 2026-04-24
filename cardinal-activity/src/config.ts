import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const cwd = process.cwd()

export const workspaceRoot = cwd.endsWith(`${path.sep}cardinal-activity`)
  ? path.resolve(cwd, '..')
  : cwd

const cardinalDiffIndexDir = path.join(os.homedir(), '.cardinal-diff', 'index')
const specDefaultDbPath = path.join(cardinalDiffIndexDir, 'cardinaldiff.sqlite')
const legacyDbPath = path.join(workspaceRoot, '.cache', 'sessions-cache.sqlite')

const resolveDefaultDbPath = (): string => {
  if (fs.existsSync(specDefaultDbPath)) {
    return specDefaultDbPath
  }

  if (fs.existsSync(legacyDbPath)) {
    return legacyDbPath
  }

  return specDefaultDbPath
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const cacheDbPath = path.resolve(process.env.CACHE_DB_PATH || resolveDefaultDbPath())

export const activityDataDir = path.resolve(
  process.env.CARDINAL_ACTIVITY_DATA_DIR || path.join(os.homedir(), '.cardinal-activity'),
)
export const screenshotsDir = path.join(activityDataDir, 'screenshots')
export const tempDir = path.join(activityDataDir, 'tmp')

export const windowPollMs = parsePositiveInt(process.env.CARDINAL_ACTIVITY_WINDOW_POLL_MS, 3000)
export const screenshotIntervalMs = parsePositiveInt(
  process.env.CARDINAL_ACTIVITY_SCREENSHOT_INTERVAL_MS,
  15000,
)
export const screenshotMaxWidth = parsePositiveInt(
  process.env.CARDINAL_ACTIVITY_SCREENSHOT_MAX_WIDTH,
  1920,
)
export const screenshotQuality = Math.max(
  30,
  Math.min(parsePositiveInt(process.env.CARDINAL_ACTIVITY_SCREENSHOT_QUALITY, 60), 90),
)
export const heartbeatIntervalMs = parsePositiveInt(
  process.env.CARDINAL_ACTIVITY_HEARTBEAT_MS,
  15000,
)

export const ensureDirectories = (): void => {
  fs.mkdirSync(path.dirname(cacheDbPath), { recursive: true })
  fs.mkdirSync(activityDataDir, { recursive: true })
  fs.mkdirSync(screenshotsDir, { recursive: true })
  fs.mkdirSync(tempDir, { recursive: true })
}
