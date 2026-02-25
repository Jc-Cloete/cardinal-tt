import { createCardinalStore, type JiraCachedIssue, type JiraCachedProject } from 'cardinal-store'
import { cacheDbPath, jiraConfig } from '../config'
import {
  addJiraCommentRemote,
  assertJiraConfigured,
  createJiraIssueRemote,
  getJiraIssueRemote,
  listJiraIssuesRemote,
  listJiraProjectsRemote,
  listJiraTransitionsRemote,
  transitionJiraIssueRemote,
} from '../integrations/jira-client'
import { serverLogger } from '../observability/logger'
import type { JiraIssue, JiraProject, JiraTransition } from '../types'

const store = createCardinalStore(cacheDbPath)
const logger = serverLogger.child({ component: 'jira-cache' })

export type JiraSyncResponse<T> = {
  items: T[]
  source: 'cache' | 'remote' | 'cache_fallback'
  syncedAt: string | null
  stale: boolean
}

export type JiraFilterOptionsResponse = {
  projects: JiraProject[]
  statuses: string[]
  assignees: string[]
  source: 'cache' | 'remote' | 'cache_fallback'
  syncedAt: string | null
  stale: boolean
}

const resolveCompositeSource = (
  sources: Array<'cache' | 'remote' | 'cache_fallback'>,
): 'cache' | 'remote' | 'cache_fallback' => {
  if (sources.includes('cache_fallback')) {
    return 'cache_fallback'
  }
  if (sources.includes('remote')) {
    return 'remote'
  }
  return 'cache'
}

const latestSyncedAt = (timestamps: Array<string | null>): string | null => {
  let latest: string | null = null
  let latestTs = Number.NEGATIVE_INFINITY

  for (const timestamp of timestamps) {
    if (!timestamp) {
      continue
    }
    const parsed = Date.parse(timestamp)
    if (Number.isFinite(parsed) && parsed > latestTs) {
      latestTs = parsed
      latest = timestamp
    }
  }

  return latest
}

const nowIso = (): string => new Date().toISOString()

const isSyncFresh = (syncedAt: string | null, ttlMs: number): boolean => {
  if (!syncedAt) {
    return false
  }
  const timestamp = Date.parse(syncedAt)
  if (!Number.isFinite(timestamp)) {
    return false
  }
  return Date.now() - timestamp <= ttlMs
}

const toRawJson = (value: JiraProject | JiraIssue): string => JSON.stringify(value)

const toCachedProject = (project: JiraProject, cachedAt: string): JiraCachedProject => ({
  jiraProjectId: project.jiraProjectId,
  projectKey: project.projectKey,
  name: project.name,
  projectType: project.projectType,
  leadDisplayName: project.leadDisplayName,
  avatarUrl: project.avatarUrl,
  rawJson: toRawJson(project),
  cachedAt,
})

const toCachedIssue = (issue: JiraIssue, cachedAt: string): JiraCachedIssue => ({
  jiraIssueId: issue.jiraIssueId,
  issueKey: issue.issueKey,
  projectKey: issue.projectKey,
  summary: issue.summary,
  statusId: issue.statusId,
  statusName: issue.statusName,
  issueType: issue.issueType,
  assigneeDisplayName: issue.assigneeDisplayName,
  priorityName: issue.priorityName,
  updatedAt: issue.updatedAt,
  rawJson: toRawJson(issue),
  cachedAt,
})

const toApiProject = (row: JiraCachedProject): JiraProject => ({
  jiraProjectId: row.jiraProjectId,
  projectKey: row.projectKey,
  name: row.name,
  projectType: row.projectType,
  leadDisplayName: row.leadDisplayName,
  avatarUrl: row.avatarUrl,
})

const toApiIssue = (row: JiraCachedIssue): JiraIssue => ({
  jiraIssueId: row.jiraIssueId,
  issueKey: row.issueKey,
  projectKey: row.projectKey,
  summary: row.summary,
  statusId: row.statusId,
  statusName: row.statusName,
  issueType: row.issueType,
  assigneeDisplayName: row.assigneeDisplayName,
  priorityName: row.priorityName,
  updatedAt: row.updatedAt,
})

export const listJiraProjects = async (
  forceRefresh: boolean,
): Promise<JiraSyncResponse<JiraProject>> =>
  logger.run(
    {
      event: 'server.jira.projects.list',
      fields: {
        force_refresh: forceRefresh,
      },
    },
    async () => {
      assertJiraConfigured()
      const cached = store.listJiraProjects()
      const syncAt = store.getJiraSyncAt('projects')
      if (
        !forceRefresh &&
        cached.length > 0 &&
        isSyncFresh(syncAt, jiraConfig.projectsCacheTtlMs)
      ) {
        return {
          items: cached.map(toApiProject),
          source: 'cache' as const,
          syncedAt: syncAt,
          stale: false,
        }
      }

      try {
        const remoteProjects = await listJiraProjectsRemote()
        const syncedAt = nowIso()
        store.replaceJiraProjects({
          projects: remoteProjects.map((project) => toCachedProject(project, syncedAt)),
          syncedAt,
        })
        return {
          items: remoteProjects,
          source: 'remote' as const,
          syncedAt,
          stale: false,
        }
      } catch (error) {
        if (cached.length > 0) {
          logger.log({
            event: 'server.jira.projects.list.fallback',
            level: 'warn',
            outcome: 'error',
            error: error instanceof Error ? error : String(error),
            fields: {
              cached_count: cached.length,
              sync_at: syncAt,
            },
          })
          return {
            items: cached.map(toApiProject),
            source: 'cache_fallback' as const,
            syncedAt: syncAt,
            stale: true,
          }
        }
        throw error
      }
    },
  )

export const listJiraIssues = async (
  projectKey: string,
  forceRefresh: boolean,
): Promise<JiraSyncResponse<JiraIssue>> =>
  logger.run(
    {
      event: 'server.jira.issues.list',
      fields: {
        project_key: projectKey,
        force_refresh: forceRefresh,
      },
    },
    async () => {
      assertJiraConfigured()
      const cacheKey = `issues:${projectKey}`
      const cached = store.listJiraIssues(projectKey)
      const syncAt = store.getJiraSyncAt(cacheKey)
      if (!forceRefresh && cached.length > 0 && isSyncFresh(syncAt, jiraConfig.issuesCacheTtlMs)) {
        return {
          items: cached.map(toApiIssue),
          source: 'cache' as const,
          syncedAt: syncAt,
          stale: false,
        }
      }

      try {
        const remoteIssues = await listJiraIssuesRemote(projectKey)
        const syncedAt = nowIso()
        store.replaceJiraIssues({
          projectKey,
          issues: remoteIssues.map((issue) => toCachedIssue(issue, syncedAt)),
          syncedAt,
        })
        return {
          items: remoteIssues,
          source: 'remote' as const,
          syncedAt,
          stale: false,
        }
      } catch (error) {
        if (cached.length > 0) {
          logger.log({
            event: 'server.jira.issues.list.fallback',
            level: 'warn',
            outcome: 'error',
            error: error instanceof Error ? error : String(error),
            fields: {
              project_key: projectKey,
              cached_count: cached.length,
              sync_at: syncAt,
            },
          })
          return {
            items: cached.map(toApiIssue),
            source: 'cache_fallback' as const,
            syncedAt: syncAt,
            stale: true,
          }
        }
        throw error
      }
    },
  )

export const listJiraFilterOptions = async (
  forceRefresh: boolean,
): Promise<JiraFilterOptionsResponse> =>
  logger.run(
    {
      event: 'server.jira.filter_options.list',
      fields: {
        force_refresh: forceRefresh,
      },
    },
    async () => {
      const projectsResult = await listJiraProjects(forceRefresh)
      let statuses = store.listJiraIssueStatusOptions()
      let assignees = store.listJiraIssueAssigneeOptions()
      const shouldHydrateIssues = forceRefresh || statuses.length === 0 || assignees.length === 0
      const issueResults: Array<JiraSyncResponse<JiraIssue>> = []

      if (shouldHydrateIssues) {
        const refreshedIssues = await Promise.all(
          projectsResult.items.map((project) => listJiraIssues(project.projectKey, forceRefresh)),
        )
        issueResults.push(...refreshedIssues)
        statuses = store.listJiraIssueStatusOptions()
        assignees = store.listJiraIssueAssigneeOptions()
      }

      const stale = projectsResult.stale || issueResults.some((result) => result.stale)
      const source = resolveCompositeSource([
        projectsResult.source,
        ...issueResults.map((result) => result.source),
      ])
      const syncedAt = latestSyncedAt([
        projectsResult.syncedAt,
        ...issueResults.map((result) => result.syncedAt),
      ])

      return {
        projects: projectsResult.items,
        statuses,
        assignees,
        source,
        syncedAt,
        stale,
      }
    },
  )

export const listJiraTransitions = async (issueKey: string): Promise<JiraTransition[]> =>
  logger.run(
    {
      event: 'server.jira.issue.transitions.list',
      fields: {
        issue_key: issueKey,
      },
    },
    () => listJiraTransitionsRemote(issueKey),
  )

const syncSingleIssue = (issue: JiraIssue): JiraIssue => {
  const cachedAt = nowIso()
  store.upsertJiraIssue(toCachedIssue(issue, cachedAt))
  return issue
}

export const addJiraIssueComment = async (args: {
  issueKey: string
  comment: string
}): Promise<JiraIssue> =>
  logger.run(
    {
      event: 'server.jira.issue.comment.add',
      fields: {
        issue_key: args.issueKey,
        comment_length: args.comment.length,
      },
    },
    async () => {
      assertJiraConfigured()
      await addJiraCommentRemote(args.issueKey, args.comment)
      const issue = await getJiraIssueRemote(args.issueKey)
      return syncSingleIssue(issue)
    },
  )

export const moveJiraIssueStatus = async (args: {
  issueKey: string
  statusId?: string
  statusName?: string
}): Promise<JiraIssue> =>
  logger.run(
    {
      event: 'server.jira.issue.status.move',
      fields: {
        issue_key: args.issueKey,
        status_id: args.statusId ?? null,
        status_name: args.statusName ?? null,
      },
    },
    async () => {
      assertJiraConfigured()
      await transitionJiraIssueRemote(args)
      const issue = await getJiraIssueRemote(args.issueKey)
      return syncSingleIssue(issue)
    },
  )

export const createJiraIssue = async (args: {
  projectKey: string
  title: string
  description: string
  statusName?: string
  issueTypeName?: string
}): Promise<JiraIssue> =>
  logger.run(
    {
      event: 'server.jira.issue.create',
      fields: {
        project_key: args.projectKey,
        title_length: args.title.length,
        description_length: args.description.length,
        requested_status_name: args.statusName ?? null,
        issue_type_name: args.issueTypeName ?? null,
      },
    },
    async () => {
      assertJiraConfigured()
      let issue = await createJiraIssueRemote(args)
      if (
        args.statusName &&
        issue.statusName?.trim().toLowerCase() !== args.statusName.trim().toLowerCase()
      ) {
        await transitionJiraIssueRemote({
          issueKey: issue.issueKey,
          statusName: args.statusName,
        })
        issue = await getJiraIssueRemote(issue.issueKey)
      }

      return syncSingleIssue(issue)
    },
  )
