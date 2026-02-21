import type { JsonObject, JsonValue } from 'cardinal-store'
import { jiraConfig } from '../config'
import { serverLogger } from '../observability/logger'
import type { JiraIssue, JiraProject, JiraTransition } from '../types'

const jiraLogger = serverLogger.child({ component: 'jira-client' })

const JIRA_ISSUE_FIELDS = 'summary,status,issuetype,assignee,priority,updated,project'
const PAGE_SIZE = 50

const asObject = (value: JsonValue | null | undefined): JsonObject | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null

const asArray = (value: JsonValue | null | undefined): JsonValue[] =>
  Array.isArray(value) ? value : []

const asString = (value: JsonValue | null | undefined): string | null =>
  typeof value === 'string' ? value : null

const asNumber = (value: JsonValue | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const buildAuthHeader = (): string => {
  if (jiraConfig.authToken) {
    return `Bearer ${jiraConfig.authToken}`
  }

  const encoded = Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64')
  return `Basic ${encoded}`
}

const parseErrorMessage = (payload: JsonValue): string => {
  const root = asObject(payload)
  if (!root) {
    return 'Unknown Jira API error'
  }

  const message = asString(root.errorMessages)
  if (message) {
    return message
  }

  const errorMessages = asArray(root.errorMessages)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
  if (errorMessages.length > 0) {
    return errorMessages.join('; ')
  }

  const errors = asObject(root.errors)
  if (errors) {
    const details = Object.entries(errors)
      .map(([key, value]) => {
        const text = asString(value)
        return text ? `${key}: ${text}` : null
      })
      .filter((item): item is string => Boolean(item))
    if (details.length > 0) {
      return details.join('; ')
    }
  }

  return 'Unknown Jira API error'
}

const buildTextAdf = (text: string): JsonObject => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  ],
})

export const assertJiraConfigured = (): void => {
  if (!jiraConfig.isConfigured) {
    throw new Error(
      'Jira integration is not configured. Set JIRA_BASE_URL and either JIRA_AUTH_TOKEN or JIRA_EMAIL + JIRA_API_TOKEN.',
    )
  }
}

const jiraFetchJson = async (
  endpointPath: string,
  args?: {
    method?: 'GET' | 'POST'
    params?: URLSearchParams
    body?: JsonObject
  },
): Promise<JsonValue> => {
  assertJiraConfigured()
  const method = args?.method || 'GET'
  const query = args?.params?.toString()
  const url = `${jiraConfig.baseUrl}${endpointPath}${query ? `?${query}` : ''}`
  const startedAt = Date.now()

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: buildAuthHeader(),
    },
    body: args?.body ? JSON.stringify(args.body) : undefined,
  })

  const contentLength = Number(response.headers.get('content-length') || 0)
  jiraLogger.log({
    event: 'server.jira.http.request',
    level: response.ok ? 'info' : 'warn',
    outcome: response.ok ? 'success' : 'error',
    fields: {
      endpoint: endpointPath,
      method,
      status_code: response.status,
      duration_ms: Date.now() - startedAt,
      has_response_body: contentLength > 0 || response.status !== 204,
    },
  })

  if (response.status === 204) {
    return null
  }

  const payload = (await response.json()) as JsonValue
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload))
  }

  return payload
}

const toIssueProjectKeyFallback = (issueKey: string): string => {
  const split = issueKey.split('-')
  return split.length > 1 ? split[0] || '' : ''
}

const toJiraProject = (value: JsonValue): JiraProject | null => {
  const root = asObject(value)
  if (!root) {
    return null
  }

  const jiraProjectId = asString(root.id)
  const projectKey = asString(root.key)
  const name = asString(root.name)
  if (!jiraProjectId || !projectKey || !name) {
    return null
  }

  const lead = asObject(root.lead)
  const avatars = asObject(root.avatarUrls)

  return {
    jiraProjectId,
    projectKey,
    name,
    projectType: asString(root.projectTypeKey),
    leadDisplayName: lead ? asString(lead.displayName) : null,
    avatarUrl: avatars ? asString(avatars['48x48']) || asString(avatars['24x24']) : null,
  }
}

const toJiraIssue = (value: JsonValue): JiraIssue | null => {
  const root = asObject(value)
  if (!root) {
    return null
  }

  const jiraIssueId = asString(root.id)
  const issueKey = asString(root.key)
  const fields = asObject(root.fields)
  if (!jiraIssueId || !issueKey || !fields) {
    return null
  }

  const status = asObject(fields.status)
  const issueType = asObject(fields.issuetype)
  const assignee = asObject(fields.assignee)
  const priority = asObject(fields.priority)
  const project = asObject(fields.project)

  return {
    jiraIssueId,
    issueKey,
    projectKey: (project ? asString(project.key) : null) || toIssueProjectKeyFallback(issueKey),
    summary: asString(fields.summary) || '',
    statusId: status ? asString(status.id) : null,
    statusName: status ? asString(status.name) : null,
    issueType: issueType ? asString(issueType.name) : null,
    assigneeDisplayName: assignee ? asString(assignee.displayName) : null,
    priorityName: priority ? asString(priority.name) : null,
    updatedAt: asString(fields.updated),
  }
}

const toJiraTransition = (value: JsonValue): JiraTransition | null => {
  const root = asObject(value)
  if (!root) {
    return null
  }

  const transitionId = asString(root.id)
  const name = asString(root.name)
  if (!transitionId || !name) {
    return null
  }

  const to = asObject(root.to)

  return {
    transitionId,
    name,
    toStatusId: to ? asString(to.id) : null,
    toStatusName: to ? asString(to.name) : null,
  }
}

export const listJiraProjectsRemote = async (): Promise<JiraProject[]> => {
  const projects: JiraProject[] = []
  let startAt = 0

  while (true) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(PAGE_SIZE),
    })
    const payload = await jiraFetchJson('/rest/api/3/project/search', { params })
    const root = asObject(payload)
    const values = asArray(root?.values)

    projects.push(
      ...values
        .map((value) => toJiraProject(value))
        .filter((value): value is JiraProject => value !== null),
    )

    const total = asNumber(root?.total)
    const nextStart = startAt + values.length
    if (values.length === 0 || (total !== null && nextStart >= total)) {
      break
    }
    startAt = nextStart
  }

  return projects
}

export const listJiraIssuesRemote = async (projectKey: string): Promise<JiraIssue[]> => {
  const issues: JiraIssue[] = []
  let startAt = 0

  while (true) {
    const params = new URLSearchParams({
      jql: `project=${projectKey} ORDER BY updated DESC`,
      fields: JIRA_ISSUE_FIELDS,
      startAt: String(startAt),
      maxResults: String(PAGE_SIZE),
    })
    const payload = await jiraFetchJson('/rest/api/3/search', { params })
    const root = asObject(payload)
    const values = asArray(root?.issues)
    issues.push(
      ...values
        .map((value) => toJiraIssue(value))
        .filter((value): value is JiraIssue => value !== null),
    )

    const total = asNumber(root?.total)
    const nextStart = startAt + values.length
    if (values.length === 0 || (total !== null && nextStart >= total)) {
      break
    }
    startAt = nextStart
  }

  return issues
}

export const getJiraIssueRemote = async (issueKey: string): Promise<JiraIssue> => {
  const params = new URLSearchParams({ fields: JIRA_ISSUE_FIELDS })
  const payload = await jiraFetchJson(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    params,
  })
  const parsed = toJiraIssue(payload)
  if (!parsed) {
    throw new Error(`Issue not found or invalid payload for ${issueKey}`)
  }
  return parsed
}

export const listJiraTransitionsRemote = async (issueKey: string): Promise<JiraTransition[]> => {
  const payload = await jiraFetchJson(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    { params: new URLSearchParams({ expand: 'transitions.fields' }) },
  )
  const root = asObject(payload)
  const transitions = asArray(root?.transitions)
  return transitions
    .map((value) => toJiraTransition(value))
    .filter((value): value is JiraTransition => value !== null)
}

export const addJiraCommentRemote = async (
  issueKey: string,
  commentText: string,
): Promise<void> => {
  await jiraFetchJson(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: 'POST',
    body: {
      body: buildTextAdf(commentText),
    },
  })
}

const resolveTransitionId = (
  transitions: JiraTransition[],
  statusId: string | undefined,
  statusName: string | undefined,
): string | null => {
  if (statusId) {
    const byId =
      transitions.find((transition) => transition.transitionId === statusId) ||
      transitions.find((transition) => transition.toStatusId === statusId)
    if (byId) {
      return byId.transitionId
    }
  }

  if (statusName) {
    const normalizedTarget = statusName.trim().toLowerCase()
    const byName = transitions.find((transition) => {
      const candidates = [transition.name, transition.toStatusName]
      return candidates.some((item) => item?.trim().toLowerCase() === normalizedTarget)
    })
    if (byName) {
      return byName.transitionId
    }
  }

  return null
}

export const transitionJiraIssueRemote = async (args: {
  issueKey: string
  statusId?: string
  statusName?: string
}): Promise<void> => {
  const transitions = await listJiraTransitionsRemote(args.issueKey)
  const transitionId = resolveTransitionId(transitions, args.statusId, args.statusName)
  if (!transitionId) {
    throw new Error(`No transition found for requested status on ${args.issueKey}`)
  }

  await jiraFetchJson(`/rest/api/3/issue/${encodeURIComponent(args.issueKey)}/transitions`, {
    method: 'POST',
    body: {
      transition: {
        id: transitionId,
      },
    },
  })
}

export const createJiraIssueRemote = async (args: {
  projectKey: string
  title: string
  description: string
  issueTypeName?: string
}): Promise<JiraIssue> => {
  const payload = await jiraFetchJson('/rest/api/3/issue', {
    method: 'POST',
    body: {
      fields: {
        project: {
          key: args.projectKey,
        },
        summary: args.title,
        issuetype: {
          name: args.issueTypeName || jiraConfig.defaultIssueType,
        },
        description: buildTextAdf(args.description),
      },
    },
  })

  const root = asObject(payload)
  const issueKey = asString(root?.key)
  if (!issueKey) {
    throw new Error('Jira issue create succeeded but no issue key was returned')
  }

  return getJiraIssueRemote(issueKey)
}
