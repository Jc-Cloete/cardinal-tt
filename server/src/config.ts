import fs from 'node:fs'
import path from 'node:path'

// Shared runtime config for session explorer + CardinalDiff API adapters.
export const ALL_PROJECTS = '_all'
export const UNKNOWN_PROJECT = '_unknown'
export const DEFAULT_CONVERSATION_BREAK_LIMIT = 10

export const port = Number(process.env.PORT || 4000)

const cwd = process.cwd()

export const workspaceRoot = cwd.endsWith(`${path.sep}server`) ? path.resolve(cwd, '..') : cwd

const codexSessionsRoot = path.join(process.env.HOME || '', '.codex', 'sessions')
const defaultRoot = fs.existsSync(codexSessionsRoot) ? codexSessionsRoot : workspaceRoot

export const dataRoot = path.resolve(process.env.DATA_ROOT || defaultRoot)
const specCacheDbPath = path.join(
  process.env.HOME || '',
  '.cardinal-diff',
  'index',
  'cardinaldiff.sqlite',
)
const legacyCacheDbPath = path.join(workspaceRoot, '.cache', 'sessions-cache.sqlite')
const defaultCacheDbPath = fs.existsSync(specCacheDbPath)
  ? specCacheDbPath
  : fs.existsSync(legacyCacheDbPath)
    ? legacyCacheDbPath
    : specCacheDbPath
export const cacheDbPath = path.resolve(process.env.CACHE_DB_PATH || defaultCacheDbPath)

const parsePositiveNumber = (rawValue: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(rawValue || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const jiraBaseUrl = String(process.env.JIRA_BASE_URL || '')
  .trim()
  .replace(/\/+$/g, '')
const jiraEmail = String(process.env.JIRA_EMAIL || '').trim()
const jiraApiToken = String(process.env.JIRA_API_TOKEN || '').trim()
const jiraAuthToken = String(process.env.JIRA_AUTH_TOKEN || '').trim()

export const jiraConfig = {
  baseUrl: jiraBaseUrl,
  email: jiraEmail,
  apiToken: jiraApiToken,
  authToken: jiraAuthToken,
  defaultIssueType: String(process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task').trim() || 'Task',
  projectsCacheTtlMs: parsePositiveNumber(process.env.JIRA_PROJECTS_CACHE_TTL_MS, 5 * 60 * 1000),
  issuesCacheTtlMs: parsePositiveNumber(process.env.JIRA_ISSUES_CACHE_TTL_MS, 60 * 1000),
  isConfigured:
    jiraBaseUrl.length > 0 &&
    (jiraAuthToken.length > 0 || (jiraEmail.length > 0 && jiraApiToken.length > 0)),
}
