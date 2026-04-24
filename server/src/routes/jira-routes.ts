import { type Request, type Response, Router } from 'express'
import {
  addJiraIssueComment,
  createJiraIssue,
  listJiraFilterOptions,
  listJiraIssues,
  listJiraProjects,
  listJiraTransitions,
  moveJiraIssueStatus,
} from '../cache/jira'
import { jiraConfig } from '../config'
import { isForceRefresh } from '../utils/requests'
import {
  failValidation,
  readOptionalString,
  readRequiredString,
  readRequiredStrings,
} from '../utils/validation'
import { instrumentRoute } from './route-utils'

export const jiraRouter = Router()

const ensureJiraConfigured = (res: Response): boolean => {
  if (jiraConfig.isConfigured) {
    return true
  }

  res.status(503).json({
    error:
      'Jira integration is not configured. Set JIRA_BASE_URL and either JIRA_AUTH_TOKEN or JIRA_EMAIL + JIRA_API_TOKEN.',
  })
  return false
}

jiraRouter.get(
  '/jira/projects',
  instrumentRoute('server.api.jira.projects.list', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const forceRefresh = isForceRefresh(req.query.refresh)
    const response = await listJiraProjects(forceRefresh)
    res.json({
      projects: response.items,
      source: response.source,
      synced_at: response.syncedAt,
      stale: response.stale,
    })
  }),
)

jiraRouter.get(
  '/jira/filter-options',
  instrumentRoute('server.api.jira.filter_options.list', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const forceRefresh = isForceRefresh(req.query.refresh)
    const response = await listJiraFilterOptions(forceRefresh)
    res.json({
      projects: response.projects,
      statuses: response.statuses,
      assignees: response.assignees,
      source: response.source,
      synced_at: response.syncedAt,
      stale: response.stale,
    })
  }),
)

jiraRouter.get(
  '/jira/issues',
  instrumentRoute('server.api.jira.issues.list', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const projectKey = readRequiredString(req.query, 'project_key', 'project_key is required')

    const forceRefresh = isForceRefresh(req.query.refresh)
    const response = await listJiraIssues(projectKey, forceRefresh)
    res.json({
      issues: response.items,
      source: response.source,
      synced_at: response.syncedAt,
      stale: response.stale,
    })
  }),
)

jiraRouter.get(
  '/jira/issues/:issueKey/transitions',
  instrumentRoute('server.api.jira.issue.transitions.list', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const issueKey = readRequiredString(req.params, 'issueKey', 'issueKey is required')

    res.json({
      transitions: await listJiraTransitions(issueKey),
    })
  }),
)

jiraRouter.post(
  '/jira/issues/:issueKey/comment',
  instrumentRoute('server.api.jira.issue.comment.add', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const issueKey = readRequiredString(req.params, 'issueKey', 'issueKey is required')
    const comment = readRequiredString(req.body, 'comment', 'comment is required')

    const issue = await addJiraIssueComment({ issueKey, comment })
    res.json({ issue })
  }),
)

jiraRouter.post(
  '/jira/issues/:issueKey/status',
  instrumentRoute('server.api.jira.issue.status.move', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const issueKey = readRequiredString(req.params, 'issueKey', 'issueKey is required')
    const statusId = readOptionalString(req.body, 'statusId') || undefined
    const statusName = readOptionalString(req.body, 'statusName') || undefined
    if (!statusId && !statusName) {
      failValidation('statusId or statusName is required')
    }

    const issue = await moveJiraIssueStatus({ issueKey, statusId, statusName })
    res.json({ issue })
  }),
)

jiraRouter.post(
  '/jira/issues',
  instrumentRoute('server.api.jira.issue.create', async (req: Request, res: Response) => {
    if (!ensureJiraConfigured(res)) {
      return
    }

    const { projectKey, title, description } = readRequiredStrings(
      req.body,
      {
        projectKey: ['projectKey', 'project_key'],
        title: 'title',
        description: 'description',
      },
      'projectKey, title and description are required',
    )
    const statusName = readOptionalString(req.body, ['statusName', 'status_name']) || undefined
    const issueTypeName =
      readOptionalString(req.body, ['issueTypeName', 'issue_type_name']) || undefined

    const issue = await createJiraIssue({
      projectKey,
      title,
      description,
      statusName,
      issueTypeName,
    })
    res.status(201).json({ issue })
  }),
)
