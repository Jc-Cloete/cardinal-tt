import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../constants'
import { clientLogger } from '../../observability/logger'
import { fetchJson, fetchText } from '../../utils/fetch'
import type {
  CardinalHeartbeat,
  CardinalHeartbeatResponse,
  CardinalProject,
  CardinalProjectMutationResponse,
  CardinalProjectsResponse,
} from './types'

const statusLogger = clientLogger.child({ component: 'use-cardinal-status' })

type UseCardinalStatusResult = {
  projects: CardinalProject[]
  heartbeat: CardinalHeartbeat | null
  loading: boolean
  mutating: boolean
  refresh: () => Promise<void>
  getTrackedProjectByRootPath: (rootPath: string) => CardinalProject | null
  trackProject: (rootPath: string) => Promise<void>
  untrackProject: (projectId: string) => Promise<void>
}

const normalizePath = (value: string): string => value.replace(/[\\/]+$/, '')

const getProjectNameFromPath = (rootPath: string): string => {
  const normalized = normalizePath(rootPath)
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

export const useCardinalStatus = (): UseCardinalStatusResult => {
  // Poll both project list and heartbeat so UI can immediately reflect tracking/service health changes.
  const [projects, setProjects] = useState<CardinalProject[]>([])
  const [heartbeat, setHeartbeat] = useState<CardinalHeartbeat | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [mutating, setMutating] = useState<boolean>(false)

  const loadProjects = useCallback(async (): Promise<void> => {
    const response = await fetchJson<CardinalProjectsResponse>(`${API}/cardinal/projects`)
    const next = Array.isArray(response.projects) ? response.projects : []
    setProjects(next)
    statusLogger.log({
      event: 'client.cardinal.projects.loaded',
      fields: {
        project_count: next.length,
      },
    })
  }, [])

  const loadHeartbeat = useCallback(async (): Promise<void> => {
    try {
      const response = await fetchJson<CardinalHeartbeatResponse>(`${API}/cardinal/heartbeat`)
      setHeartbeat(response.heartbeat || null)
      statusLogger.log({
        event: 'client.cardinal.heartbeat.loaded',
        fields: {
          healthy: response.heartbeat?.healthy ?? false,
          has_heartbeat: Boolean(response.heartbeat),
        },
      })
    } catch (error) {
      statusLogger.log({
        event: 'client.cardinal.heartbeat.load_failed',
        level: 'warn',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {},
      })
      setHeartbeat(null)
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await Promise.all([loadProjects(), loadHeartbeat()])
      statusLogger.log({
        event: 'client.cardinal.status.refresh.success',
        fields: {},
      })
    } catch (error) {
      statusLogger.log({
        event: 'client.cardinal.status.refresh.failed',
        level: 'error',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {},
      })
    } finally {
      setLoading(false)
    }
  }, [loadHeartbeat, loadProjects])

  const getTrackedProjectByRootPath = useCallback(
    (rootPath: string): CardinalProject | null => {
      const normalized = normalizePath(rootPath)
      const project = projects.find((item) => normalizePath(item.rootPath) === normalized)
      return project || null
    },
    [projects],
  )

  const trackProject = useCallback(
    async (rootPath: string): Promise<void> => {
      setMutating(true)
      try {
        await fetchJson<CardinalProjectMutationResponse>(`${API}/cardinal/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rootPath,
            name: getProjectNameFromPath(rootPath),
            mode: 'metadata',
            hashPolicy: 'off',
          }),
        })
        statusLogger.log({
          event: 'client.cardinal.project.track.success',
          fields: {
            root_path: rootPath,
          },
        })
        await loadProjects()
      } catch (error) {
        statusLogger.log({
          event: 'client.cardinal.project.track.failed',
          level: 'error',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            root_path: rootPath,
          },
        })
        throw error
      } finally {
        setMutating(false)
      }
    },
    [loadProjects],
  )

  const untrackProject = useCallback(
    async (projectId: string): Promise<void> => {
      setMutating(true)
      try {
        await fetchText(`${API}/cardinal/projects/${encodeURIComponent(projectId)}`, {
          method: 'DELETE',
        })
        statusLogger.log({
          event: 'client.cardinal.project.untrack.success',
          fields: {
            project_id: projectId,
          },
        })
        await loadProjects()
      } catch (error) {
        statusLogger.log({
          event: 'client.cardinal.project.untrack.failed',
          level: 'error',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            project_id: projectId,
          },
        })
        throw error
      } finally {
        setMutating(false)
      }
    },
    [loadProjects],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadHeartbeat()
    }, 10_000)

    return () => window.clearInterval(timer)
  }, [loadHeartbeat])

  return useMemo(
    () => ({
      projects,
      heartbeat,
      loading,
      mutating,
      refresh,
      getTrackedProjectByRootPath,
      trackProject,
      untrackProject,
    }),
    [
      projects,
      heartbeat,
      loading,
      mutating,
      refresh,
      getTrackedProjectByRootPath,
      trackProject,
      untrackProject,
    ],
  )
}
