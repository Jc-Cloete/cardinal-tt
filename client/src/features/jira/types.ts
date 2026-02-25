export type JiraProject = {
  jiraProjectId: string
  projectKey: string
  name: string
  projectType: string | null
  leadDisplayName: string | null
  avatarUrl: string | null
}

export type JiraIssue = {
  jiraIssueId: string
  issueKey: string
  projectKey: string
  summary: string
  statusId: string | null
  statusName: string | null
  issueType: string | null
  assigneeDisplayName: string | null
  priorityName: string | null
  updatedAt: string | null
}

export type JiraTransition = {
  transitionId: string
  name: string
  toStatusId: string | null
  toStatusName: string | null
}

export type JiraProjectsResponse = {
  projects: JiraProject[]
  source: 'cache' | 'remote' | 'cache_fallback'
  synced_at: string | null
  stale: boolean
}

export type JiraIssuesResponse = {
  issues: JiraIssue[]
  source: 'cache' | 'remote' | 'cache_fallback'
  synced_at: string | null
  stale: boolean
}

export type JiraTransitionsResponse = {
  transitions: JiraTransition[]
}

export type JiraIssueResponse = {
  issue: JiraIssue
}

export type JiraFilterOptionsResponse = {
  projects: JiraProject[]
  statuses: string[]
  assignees: string[]
  source: 'cache' | 'remote' | 'cache_fallback'
  synced_at: string | null
  stale: boolean
}
