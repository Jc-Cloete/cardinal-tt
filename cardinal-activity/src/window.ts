import { runCommand } from './process'
import type { WindowSample } from './types'

const WINDOW_SEPARATOR = '\t'

export const parseWindowSampleOutput = (raw: string, observedAt: string): WindowSample | null => {
  const normalized = raw.trim()
  if (!normalized) {
    return null
  }

  const parts = normalized.split(WINDOW_SEPARATOR)
  if (parts.length < 4) {
    return null
  }

  const appName = parts[0]?.trim() || ''
  const ownerPidRaw = parts[1]?.trim() || ''
  const bundleIdRaw = parts[2]?.trim() || ''
  const windowTitle = parts.slice(3).join(WINDOW_SEPARATOR).trim()

  if (!appName) {
    return null
  }

  const ownerPid = Number.parseInt(ownerPidRaw, 10)

  return {
    observedAt,
    appName,
    windowTitle,
    bundleId: bundleIdRaw || null,
    ownerPid: Number.isFinite(ownerPid) ? ownerPid : null,
  }
}

export const readActiveWindowSample = async (observedAt: string): Promise<WindowSample | null> => {
  const script = [
    'tell application "System Events"',
    'set frontApp to first application process whose frontmost is true',
    'set appName to name of frontApp',
    'set appPid to unix id of frontApp',
    'set bundleId to ""',
    'try',
    'set bundleId to bundle identifier of application file of frontApp',
    'end try',
    'set windowTitle to ""',
    'try',
    'set windowTitle to name of front window of frontApp',
    'end try',
    'return appName & tab & (appPid as string) & tab & bundleId & tab & windowTitle',
    'end tell',
  ].join('\n')

  const { exitCode, stdout } = await runCommand(['osascript', '-e', script])
  if (exitCode !== 0) {
    return null
  }

  return parseWindowSampleOutput(stdout, observedAt)
}
