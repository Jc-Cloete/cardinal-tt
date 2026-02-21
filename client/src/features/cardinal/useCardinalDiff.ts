import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../constants'
import { clientLogger } from '../../observability/logger'
import { fetchJson } from '../../utils/fetch'
import type {
  CardinalCommit,
  CardinalCommitDetailResponse,
  CardinalCommitEntry,
  CardinalCommitsResponse,
  CardinalDiffEntry,
  CardinalDiffResponse,
  CardinalProject,
  CardinalProjectsResponse,
} from './types'

const diffLogger = clientLogger.child({ component: 'use-cardinal-diff' })

type UseCardinalDiffResult = {
  loading: boolean
  projects: CardinalProject[]
  selectedProjectId: string
  commits: CardinalCommit[]
  selectedCommitId: string
  compareFromCommitId: string
  commitEntries: CardinalCommitEntry[]
  diffEntries: CardinalDiffEntry[]
  setSelectedProjectId: (projectId: string) => void
  setSelectedCommitId: (commitId: string) => void
  setCompareFromCommitId: (commitId: string) => void
  refresh: () => Promise<void>
}

export const useCardinalDiff = (): UseCardinalDiffResult => {
  const [loading, setLoading] = useState<boolean>(false)
  const [projects, setProjects] = useState<CardinalProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [commits, setCommits] = useState<CardinalCommit[]>([])
  const [selectedCommitId, setSelectedCommitId] = useState<string>('')
  const [compareFromCommitId, setCompareFromCommitId] = useState<string>('')
  const [commitEntries, setCommitEntries] = useState<CardinalCommitEntry[]>([])
  const [diffEntries, setDiffEntries] = useState<CardinalDiffEntry[]>([])

  const loadProjects = useCallback(async (): Promise<void> => {
    const data = await fetchJson<CardinalProjectsResponse>(`${API}/cardinal/projects`)
    const nextProjects = Array.isArray(data.projects) ? data.projects : []
    setProjects(nextProjects)
    diffLogger.log({
      event: 'client.cardinal.diff.projects.loaded',
      fields: {
        project_count: nextProjects.length,
      },
    })
    setSelectedProjectId((prev) => {
      if (prev && nextProjects.some((project) => project.projectId === prev)) {
        return prev
      }
      return nextProjects[0]?.projectId || ''
    })
  }, [])

  const loadCommits = useCallback(async (projectId: string): Promise<void> => {
    if (!projectId) {
      setCommits([])
      setSelectedCommitId('')
      setCommitEntries([])
      diffLogger.log({
        event: 'client.cardinal.diff.commits.cleared',
        fields: {},
      })
      return
    }

    const data = await fetchJson<CardinalCommitsResponse>(
      `${API}/cardinal/commits?project_id=${encodeURIComponent(projectId)}&limit=100`,
    )
    const nextCommits = Array.isArray(data.commits) ? data.commits : []
    setCommits(nextCommits)
    diffLogger.log({
      event: 'client.cardinal.diff.commits.loaded',
      fields: {
        project_id: projectId,
        commit_count: nextCommits.length,
      },
    })
    setSelectedCommitId((prev) => {
      if (prev && nextCommits.some((commit) => commit.commitId === prev)) {
        return prev
      }
      return nextCommits[0]?.commitId || ''
    })
    setCompareFromCommitId((prev) => {
      if (prev && nextCommits.some((commit) => commit.commitId === prev)) {
        return prev
      }
      return nextCommits[1]?.commitId || ''
    })
  }, [])

  const loadCommitDetails = useCallback(async (commitId: string): Promise<void> => {
    if (!commitId) {
      setCommitEntries([])
      diffLogger.log({
        event: 'client.cardinal.diff.commit_details.cleared',
        fields: {},
      })
      return
    }

    const data = await fetchJson<CardinalCommitDetailResponse>(
      `${API}/cardinal/commit/${encodeURIComponent(commitId)}`,
    )
    const entries = Array.isArray(data.entries) ? data.entries : []
    setCommitEntries(entries)
    diffLogger.log({
      event: 'client.cardinal.diff.commit_details.loaded',
      fields: {
        commit_id: commitId,
        entry_count: entries.length,
      },
    })
  }, [])

  const loadDiffEntries = useCallback(
    async (projectId: string, fromCommitId: string, toCommitId: string): Promise<void> => {
      if (!projectId || !fromCommitId || !toCommitId) {
        setDiffEntries([])
        diffLogger.log({
          event: 'client.cardinal.diff.entries.cleared',
          fields: {},
        })
        return
      }

      const data = await fetchJson<CardinalDiffResponse>(
        `${API}/cardinal/diff?project_id=${encodeURIComponent(projectId)}&from_commit_id=${encodeURIComponent(fromCommitId)}&to_commit_id=${encodeURIComponent(toCommitId)}`,
      )
      const entries = Array.isArray(data.entries) ? data.entries : []
      setDiffEntries(entries)
      diffLogger.log({
        event: 'client.cardinal.diff.entries.loaded',
        fields: {
          project_id: projectId,
          from_commit_id: fromCommitId,
          to_commit_id: toCommitId,
          entry_count: entries.length,
        },
      })
    },
    [],
  )

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await loadProjects()
      diffLogger.log({
        event: 'client.cardinal.diff.refresh.success',
        fields: {},
      })
    } catch (error) {
      diffLogger.log({
        event: 'client.cardinal.diff.refresh.failed',
        level: 'error',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {},
      })
    } finally {
      setLoading(false)
    }
  }, [loadProjects])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void loadCommits(selectedProjectId)
  }, [selectedProjectId, loadCommits])

  useEffect(() => {
    void loadCommitDetails(selectedCommitId)
  }, [selectedCommitId, loadCommitDetails])

  useEffect(() => {
    void loadDiffEntries(selectedProjectId, compareFromCommitId, selectedCommitId)
  }, [selectedProjectId, compareFromCommitId, selectedCommitId, loadDiffEntries])

  return useMemo(
    () => ({
      loading,
      projects,
      selectedProjectId,
      commits,
      selectedCommitId,
      compareFromCommitId,
      commitEntries,
      diffEntries,
      setSelectedProjectId,
      setSelectedCommitId,
      setCompareFromCommitId,
      refresh,
    }),
    [
      loading,
      projects,
      selectedProjectId,
      commits,
      selectedCommitId,
      compareFromCommitId,
      commitEntries,
      diffEntries,
      refresh,
    ],
  )
}
