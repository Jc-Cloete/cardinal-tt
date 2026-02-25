import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API } from '../../constants'
import { useToast } from '../../notifications/ToastProvider'
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
  loadedIssuesProjectKey: string
  projectsSync: JiraSyncMeta | null
  issuesSync: JiraSyncMeta | null
  setSelectedProjectKey: (projectKey: string) => void
  setSelectedIssueKey: (issueKey: string) => void
  refreshProjects: (forceRefresh: boolean, notify?: boolean) => Promise<void>
  refreshIssues: (forceRefresh: boolean, notify?: boolean) => Promise<void>
  loadTransitions: (issueKey: string) => Promise<void>
  addComment: (issueKey: string, comment: string, notify?: boolean) => Promise<void>
  moveStatus: (
    args: { issueKey: string; statusId?: string; statusName?: string },
    notify?: boolean,
  ) => Promise<void>
  createIssue: (
    args: {
      projectKey: string
      title: string
      description: string
      statusName?: string
      issueTypeName?: string
    },
    notify?: boolean,
  ) => Promise<void>
}

export const useJira = (): UseJiraResult => {
  const { success: showSuccessToast, error: showErrorToast } = useToast()
  const [loading, setLoading] = useState<boolean>(false)
  const [mutating, setMutating] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [transitions, setTransitions] = useState<JiraTransition[]>([])
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('')
  const [selectedIssueKey, setSelectedIssueKey] = useState<string>('')
  const [loadedIssuesProjectKey, setLoadedIssuesProjectKey] = useState<string>('')
  const [projectsSync, setProjectsSync] = useState<JiraSyncMeta | null>(null)
  const [issuesSync, setIssuesSync] = useState<JiraSyncMeta | null>(null)
  const issuesRequestVersionRef = useRef<number>(0)

  const refreshProjects = useCallback(
    async (forceRefresh: boolean, notify: boolean = false): Promise<void> => {
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
        if (notify) {
          showSuccessToast(
            forceRefresh ? 'Projects force refreshed' : 'Projects reloaded',
            `${projectRows.length} projects loaded from ${response.source}.`,
          )
        }
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
        if (notify) {
          showErrorToast('Failed to load Jira projects', message)
        }
      } finally {
        setLoading(false)
      }
    },
    [showErrorToast, showSuccessToast],
  )

  const refreshIssues = useCallback(
    async (forceRefresh: boolean, notify: boolean = false): Promise<void> => {
      if (!selectedProjectKey) {
        issuesRequestVersionRef.current += 1
        setIssues([])
        setIssuesSync(null)
        setLoadedIssuesProjectKey('')
        return
      }

      const requestedProjectKey = selectedProjectKey
      const requestVersion = issuesRequestVersionRef.current + 1
      issuesRequestVersionRef.current = requestVersion
      setLoading(true)
      try {
        const response = await fetchJson<JiraIssuesResponse>(
          `${API}/jira/issues?project_key=${encodeURIComponent(requestedProjectKey)}${
            forceRefresh ? '&refresh=1' : ''
          }`,
        )
        if (requestVersion !== issuesRequestVersionRef.current) {
          return
        }
        const issueRows = Array.isArray(response.issues) ? response.issues : []
        setLoadedIssuesProjectKey(requestedProjectKey)
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
            project_key: requestedProjectKey,
            force_refresh: forceRefresh,
            source: response.source,
            stale: response.stale,
            issue_count: issueRows.length,
          },
        })
        if (notify) {
          showSuccessToast(
            forceRefresh ? 'Tickets force refreshed' : 'Tickets reloaded',
            `${issueRows.length} tickets loaded for ${requestedProjectKey}.`,
          )
        }
      } catch (requestError) {
        if (requestVersion !== issuesRequestVersionRef.current) {
          return
        }
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        jiraLogger.log({
          event: 'client.jira.issues.load_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            project_key: requestedProjectKey,
            force_refresh: forceRefresh,
          },
        })
        if (notify) {
          showErrorToast('Failed to load Jira tickets', message)
        }
      } finally {
        if (requestVersion === issuesRequestVersionRef.current) {
          setLoading(false)
        }
      }
    },
    [selectedProjectKey, showErrorToast, showSuccessToast],
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
    async (issueKey: string, comment: string, notify: boolean = true): Promise<void> => {
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
        await refreshIssues(true, false)
        await loadTransitions(issueKey)
        setError('')
        if (notify) {
          showSuccessToast('Comment added', `Added comment to ${issueKey}.`)
        }
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
        if (notify) {
          showErrorToast('Failed to add comment', message)
        }
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues, showErrorToast, showSuccessToast],
  )

  const moveStatus = useCallback(
    async (
      args: { issueKey: string; statusId?: string; statusName?: string },
      notify: boolean = true,
    ): Promise<void> => {
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
        await refreshIssues(true, false)
        await loadTransitions(args.issueKey)
        setError('')
        if (notify) {
          showSuccessToast('Status updated', `Updated status for ${args.issueKey}.`)
        }
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
        if (notify) {
          showErrorToast('Failed to update status', message)
        }
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues, showErrorToast, showSuccessToast],
  )

  const createIssue = useCallback(
    async (
      args: {
        projectKey: string
        title: string
        description: string
        statusName?: string
        issueTypeName?: string
      },
      notify: boolean = true,
    ): Promise<void> => {
      setMutating(true)
      try {
        const response = await fetchJson<JiraIssueResponse>(`${API}/jira/issues`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
        })
        await refreshIssues(true, false)
        if (response.issue.issueKey) {
          setSelectedIssueKey(response.issue.issueKey)
          await loadTransitions(response.issue.issueKey)
        }
        setError('')
        if (notify) {
          showSuccessToast(
            'Ticket created',
            response.issue.issueKey
              ? `Created ${response.issue.issueKey} in ${args.projectKey}.`
              : `Ticket created in ${args.projectKey}.`,
          )
        }
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
        if (notify) {
          showErrorToast('Failed to create ticket', message)
        }
      } finally {
        setMutating(false)
      }
    },
    [loadTransitions, refreshIssues, showErrorToast, showSuccessToast],
  )

  useEffect(() => {
    void refreshProjects(false, false)
  }, [refreshProjects])

  useEffect(() => {
    void refreshIssues(false, false)
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
      loadedIssuesProjectKey,
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
      loadedIssuesProjectKey,
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
