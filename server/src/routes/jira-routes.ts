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

    const projectKey = String(req.query.project_key ?? '').trim()
    if (!projectKey) {
      res.status(400).json({ error: 'project_key is required' })
      return
    }

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

    const issueKey = String(req.params.issueKey ?? '').trim()
    if (!issueKey) {
      res.status(400).json({ error: 'issueKey is required' })
      return
    }

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

    const issueKey = String(req.params.issueKey ?? '').trim()
    if (!issueKey) {
      res.status(400).json({ error: 'issueKey is required' })
      return
    }

    const comment = String(req.body?.comment ?? '').trim()
    if (!comment) {
      res.status(400).json({ error: 'comment is required' })
      return
    }

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

    const issueKey = String(req.params.issueKey ?? '').trim()
    if (!issueKey) {
      res.status(400).json({ error: 'issueKey is required' })
      return
    }

    const statusId = String(req.body?.statusId ?? '').trim() || undefined
    const statusName = String(req.body?.statusName ?? '').trim() || undefined
    if (!statusId && !statusName) {
      res.status(400).json({ error: 'statusId or statusName is required' })
      return
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

    const projectKey = String(req.body?.projectKey ?? req.body?.project_key ?? '').trim()
    const title = String(req.body?.title ?? '').trim()
    const description = String(req.body?.description ?? '').trim()
    const statusName =
      String(req.body?.statusName ?? req.body?.status_name ?? '').trim() || undefined
    const issueTypeName =
      String(req.body?.issueTypeName ?? req.body?.issue_type_name ?? '').trim() || undefined

    if (!projectKey || !title || !description) {
      res.status(400).json({ error: 'projectKey, title and description are required' })
      return
    }

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
