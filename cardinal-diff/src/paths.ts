import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_COMMIT_IDLE_MS,
  DEFAULT_COMMIT_MAX_INTERVAL_MS,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_MAX_BLOB_SIZE_BYTES,
} from './defaults'

const cwd = process.cwd()

export const repoRoot = cwd.endsWith(`${path.sep}cardinal-diff`)
  ? path.resolve(cwd, '..')
  : fs.existsSync(path.join(cwd, 'cardinal-diff'))
    ? cwd
    : cwd

export const dataDir = path.join(os.homedir(), '.cardinal-diff')
export const objectsDir = path.join(dataDir, 'objects')
export const logsDir = path.join(dataDir, 'logs')
export const projectsDir = path.join(dataDir, 'projects')
export const ignoreTemplatePath = path.join(projectsDir, 'default.cardinaldiffignore')
export const indexDir = path.join(dataDir, 'index')
export const commitsDir = path.join(dataDir, 'commits')
export const configPath = path.join(dataDir, 'config.json')
export const launchAgentPlistPath = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  'com.cardinaldiff.agent.plist',
)

const specDefaultDbPath = path.join(indexDir, 'cardinaldiff.sqlite')
const legacyDbPath = path.join(repoRoot, '.cache', 'sessions-cache.sqlite')

const resolveDefaultCacheDbPath = (): string => {
  if (fs.existsSync(specDefaultDbPath)) {
    return specDefaultDbPath
  }

  if (fs.existsSync(legacyDbPath)) {
    return legacyDbPath
  }

  return specDefaultDbPath
}

export const cacheDbPath = path.resolve(
  process.env.CACHE_DB_PATH || resolveDefaultCacheDbPath(),
)

const ensureDefaultConfig = (): void => {
  if (fs.existsSync(configPath)) {
    return
  }

  const now = new Date().toISOString()
  const initialConfig = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    defaults: {
      debounceMs: DEFAULT_DEBOUNCE_MS,
      commitIdleMs: DEFAULT_COMMIT_IDLE_MS,
      commitMaxIntervalMs: DEFAULT_COMMIT_MAX_INTERVAL_MS,
      maxBlobSizeBytes: DEFAULT_MAX_BLOB_SIZE_BYTES,
      ignoreRules: DEFAULT_IGNORE_PATTERNS,
      hashPolicy: 'off',
    },
  }

  fs.writeFileSync(configPath, `${JSON.stringify(initialConfig, null, 2)}\n`, 'utf8')
}

const ensureIgnoreTemplate = (): void => {
  if (fs.existsSync(ignoreTemplatePath)) {
    return
  }

  const lines = [
    '# cardinaldiff default ignore template',
    '# Copy this file to <project>/.cardinaldiffignore and adjust per project.',
    '',
    ...DEFAULT_IGNORE_PATTERNS,
    '',
  ]
  fs.writeFileSync(ignoreTemplatePath, `${lines.join('\n')}\n`, 'utf8')
}

export const ensureDirectories = (): void => {
  fs.mkdirSync(dataDir, {recursive: true})
  fs.mkdirSync(objectsDir, {recursive: true})
  fs.mkdirSync(logsDir, {recursive: true})
  fs.mkdirSync(projectsDir, {recursive: true})
  fs.mkdirSync(indexDir, {recursive: true})
  fs.mkdirSync(commitsDir, {recursive: true})
  fs.mkdirSync(path.dirname(cacheDbPath), {recursive: true})
  ensureDefaultConfig()
  ensureIgnoreTemplate()
}
