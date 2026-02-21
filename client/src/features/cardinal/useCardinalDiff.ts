import {useCallback, useEffect, useMemo, useState} from 'react'
import {API} from '../../constants'
import {fetchJson} from '../../utils/fetch'
import type {
  CardinalCommit,
  CardinalCommitDetailResponse,
  CardinalDiffEntry,
  CardinalDiffResponse,
  CardinalCommitEntry,
  CardinalCommitsResponse,
  CardinalProject,
  CardinalProjectsResponse,
} from './types'

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
      return
    }

    const data = await fetchJson<CardinalCommitsResponse>(
      `${API}/cardinal/commits?project_id=${encodeURIComponent(projectId)}&limit=100`,
    )
    const nextCommits = Array.isArray(data.commits) ? data.commits : []
    setCommits(nextCommits)
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
      return
    }

    const data = await fetchJson<CardinalCommitDetailResponse>(`${API}/cardinal/commit/${encodeURIComponent(commitId)}`)
    setCommitEntries(Array.isArray(data.entries) ? data.entries : [])
  }, [])

  const loadDiffEntries = useCallback(async (projectId: string, fromCommitId: string, toCommitId: string): Promise<void> => {
    if (!projectId || !fromCommitId || !toCommitId) {
      setDiffEntries([])
      return
    }

    const data = await fetchJson<CardinalDiffResponse>(
      `${API}/cardinal/diff?project_id=${encodeURIComponent(projectId)}&from_commit_id=${encodeURIComponent(fromCommitId)}&to_commit_id=${encodeURIComponent(toCommitId)}`,
    )
    setDiffEntries(Array.isArray(data.entries) ? data.entries : [])
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await loadProjects()
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
