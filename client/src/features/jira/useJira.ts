import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../constants'
import { clientLogger } from '../../observability/logger'
import { fetchJson } from '../../utils/fetch'
import type {
  JiraIssue,
  JiraIssueResponse,
  JiraIssuesResponse,
  JiraProject,
  JiraProjectsResponse,
  JiraTransition,
  JiraTransitionsResponse,
} from './types'

const jiraLogger = clientLogger.child({ component: 'use-jira' })

type JiraSyncMeta = {
  source: 'cache' | 'remote' | 'cache_fallback'
  syncedAt: string | null
  stale: boolean
}

type UseJiraResult = {
  loading: boolean
  mutating: boolean
  error: string
  projects: JiraProject[]
  issues: JiraIssue[]
  transitions: JiraTransition[]
  selectedProjectKey: string
  selectedIssueKey: string
  projectsSync: JiraSyncMeta | null
  issuesSync: JiraSyncMeta | null
  setSelectedProjectKey: (projectKey: string) => void
  setSelectedIssueKey: (issueKey: string) => void
  refreshProjects: (forceRefresh: boolean) => Promise<void>
  refreshIssues: (forceRefresh: boolean) => Promise<void>
  loadTransitions: (issueKey: string) => Promise<void>
  addComment: (issueKey: string, comment: string) => Promise<void>
  moveStatus: (args: { issueKey: string; statusId?: string; statusName?: string }) => Promise<void>
  createIssue: (args: {
    projectKey: string
    title: string
    description: string
    statusName?: string
    issueTypeName?: string
  }) => Promise<void>
}

export const useJira = (): UseJiraResult => {
  const [loading, setLoading] = useState<boolean>(false)
  const [mutating, setMutating] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [transitions, setTransitions] = useState<JiraTransition[]>([])
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('')
  const [selectedIssueKey, setSelectedIssueKey] = useState<string>('')
  const [projectsSync, setProjectsSync] = useState<JiraSyncMeta | null>(null)
  const [issuesSync, setIssuesSync] = useState<JiraSyncMeta | null>(null)

  const refreshProjects = useCallback(async (forceRefresh: boolean): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetchJson<JiraProjectsResponse>(
        `${API}/jira/projects${forceRefresh ? '?refresh=1' : ''}`,
      )
      const projectRows = Array.isArray(response.projects) ? response.projects : []
      setProjects(projectRows)
      setProjectsSync({
        source: response.source,
        syncedAt: response.synced_at,
        stale: response.stale,
      })
      setSelectedProjectKey((prev) => {
        if (prev && projectRows.some((project) => project.projectKey === prev)) {
          return prev
        }
        return projectRows[0]?.projectKey || ''
      })
      setError('')
      jiraLogger.log({
        event: 'client.jira.projects.loaded',
        fields: {
          force_refresh: forceRefresh,
          source: response.source,
          stale: response.stale,
          project_count: projectRows.length,
        },
      })
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : String(requestError || '')
      setError(message)
      jiraLogger.log({
        event: 'client.jira.projects.load_failed',
        level: 'warn',
        outcome: 'error',
        error: message,
        fields: {
          force_refresh: forceRefresh,
        },
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshIssues = useCallback(
    async (forceRefresh: boolean): Promise<void> => {
      if (!selectedProjectKey) {
        setIssues([])
        setIssuesSync(null)
        return
      }

      setLoading(true)
      try {
        const response = await fetchJson<JiraIssuesResponse>(
          `${API}/jira/issues?project_key=${encodeURIComponent(selectedProjectKey)}${
            forceRefresh ? '&refresh=1' : ''
          }`,
        )
        const issueRows = Array.isArray(response.issues) ? response.issues : []
        setIssues(issueRows)
        setIssuesSync({
          source: response.source,
          syncedAt: response.synced_at,
          stale: response.stale,
        })
        setSelectedIssueKey((prev) => {
          if (prev && issueRows.some((issue) => issue.issueKey === prev)) {
            return prev
          }
          return issueRows[0]?.issueKey || ''
        })
        setError('')
        jiraLogger.log({
          event: 'client.jira.issues.loaded',
          fields: {
            project_key: selectedProjectKey,
            force_refresh: forceRefresh,
            source: response.source,
            stale: response.stale,
            issue_count: issueRows.length,
          },
        })
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        jiraLogger.log({
          event: 'client.jira.issues.load_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            project_key: selectedProjectKey,
            force_refresh: forceRefresh,
          },
        })
      } finally {
        setLoading(false)
      }
    },
    [selectedProjectKey],
  )

  const loadTransitions = useCallback(async (issueKey: string): Promise<void> => {
    if (!issueKey) {
      setTransitions([])
      return
    }

    try {
      const response = await fetchJson<JiraTransitionsResponse>(
        `${API}/jira/issues/${encodeURIComponent(issueKey)}/transitions`,
      )
      setTransitions(Array.isArray(response.transitions) ? response.transitions : [])
      setError('')
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : String(requestError || '')
      setError(message)
      setTransitions([])
      jiraLogger.log({
        event: 'client.jira.transitions.load_failed',
        level: 'warn',
        outcome: 'error',
        error: message,
        fields: {
          issue_key: issueKey,
        },
      })
    }
  }, [])

  const addComment = useCallback(
    async (issueKey: string, comment: string): Promise<void> => {
      setMutating(true)
      try {
        await fetchJson<JiraIssueResponse>(
          `${API}/jira/issues/${encodeURIComponent(issueKey)}/comment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ comment }),
          },
        )
        await refreshIssues(true)
        await loadTransitions(issueKey)
        setError('')
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        jiraLogger.log({
          event: 'client.jira.issue.comment_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            issue_key: issueKey,
            comment_length: comment.length,
          },
        })
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues],
  )

  const moveStatus = useCallback(
    async (args: { issueKey: string; statusId?: string; statusName?: string }): Promise<void> => {
      setMutating(true)
      try {
        await fetchJson<JiraIssueResponse>(
          `${API}/jira/issues/${encodeURIComponent(args.issueKey)}/status`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              statusId: args.statusId,
              statusName: args.statusName,
            }),
          },
        )
        await refreshIssues(true)
        await loadTransitions(args.issueKey)
        setError('')
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        jiraLogger.log({
          event: 'client.jira.issue.status_move_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            issue_key: args.issueKey,
            status_id: args.statusId ?? null,
            status_name: args.statusName ?? null,
          },
        })
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues],
  )

  const createIssue = useCallback(
    async (args: {
      projectKey: string
      title: string
      description: string
      statusName?: string
      issueTypeName?: string
    }): Promise<void> => {
      setMutating(true)
      try {
        const response = await fetchJson<JiraIssueResponse>(`${API}/jira/issues`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
        })
        await refreshIssues(true)
        if (response.issue.issueKey) {
          setSelectedIssueKey(response.issue.issueKey)
          await loadTransitions(response.issue.issueKey)
        }
        setError('')
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        jiraLogger.log({
          event: 'client.jira.issue.create_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            project_key: args.projectKey,
            has_status: Boolean(args.statusName),
          },
        })
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues],
  )

  useEffect(() => {
    void refreshProjects(false)
  }, [refreshProjects])

  useEffect(() => {
    void refreshIssues(false)
  }, [refreshIssues])

  useEffect(() => {
    if (!selectedIssueKey) {
      setTransitions([])
      return
    }
    void loadTransitions(selectedIssueKey)
  }, [loadTransitions, selectedIssueKey])

  return useMemo(
    () => ({
      loading,
      mutating,
      error,
      projects,
      issues,
      transitions,
      selectedProjectKey,
      selectedIssueKey,
      projectsSync,
      issuesSync,
      setSelectedProjectKey,
      setSelectedIssueKey,
      refreshProjects,
      refreshIssues,
      loadTransitions,
      addComment,
      moveStatus,
      createIssue,
    }),
    [
      loading,
      mutating,
      error,
      projects,
      issues,
      transitions,
      selectedProjectKey,
      selectedIssueKey,
      projectsSync,
      issuesSync,
      refreshProjects,
      refreshIssues,
      loadTransitions,
      addComment,
      moveStatus,
      createIssue,
    ],
  )
}
