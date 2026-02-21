import fs from 'node:fs'
import path from 'node:path'

export const ALL_PROJECTS = '_all'
export const UNKNOWN_PROJECT = '_unknown'
export const DEFAULT_CONVERSATION_BREAK_LIMIT = 10

export const port = Number(process.env.PORT || 4000)

const cwd = process.cwd()

export const workspaceRoot = cwd.endsWith(`${path.sep}server`)
  ? path.resolve(cwd, '..')
  : cwd

const codexSessionsRoot = path.join(process.env.HOME || '', '.codex', 'sessions')
const defaultRoot = fs.existsSync(codexSessionsRoot) ? codexSessionsRoot : workspaceRoot

export const dataRoot = path.resolve(process.env.DATA_ROOT || defaultRoot)
const specCacheDbPath = path.join(process.env.HOME || '', '.cardinal-diff', 'index', 'cardinaldiff.sqlite')
const legacyCacheDbPath = path.join(workspaceRoot, '.cache', 'sessions-cache.sqlite')
const defaultCacheDbPath = fs.existsSync(specCacheDbPath)
  ? specCacheDbPath
  : fs.existsSync(legacyCacheDbPath)
    ? legacyCacheDbPath
    : specCacheDbPath
export const cacheDbPath = path.resolve(
  process.env.CACHE_DB_PATH || defaultCacheDbPath,
)
