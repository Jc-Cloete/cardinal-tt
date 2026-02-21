import { useCallback, useEffect, useMemo, useState } from 'react'
import { ALL_PROJECTS, API } from '../constants'
import { clientLogger } from '../observability/logger'
import type {
  DateParts,
  DaysResponse,
  FilesResponse,
  MonthsResponse,
  ProjectsResponse,
  RootResponse,
  SessionFile,
  YearsResponse,
} from '../types'
import { getTodayParts, normalizeNumericDatePart, pickDateOption, toSorted } from '../utils/date'
import { fetchJson, fetchText } from '../utils/fetch'

const explorerLogger = clientLogger.child({
  component: 'use-conversation-explorer',
})

type UseConversationExplorerResult = {
  rootDir: string
  conversationBreakLimit: number
  isRefreshingCache: boolean
  years: string[]
  months: string[]
  days: string[]
  projects: string[]
  files: SessionFile[]
  year: string
  month: string
  day: string
  project: string
  activeFile: string
  fileContent: string
  setYear: (value: string) => void
  setMonth: (value: string) => void
  setDay: (value: string) => void
  setProject: (value: string) => void
  setActiveFile: (value: string) => void
  closePreview: () => void
  updateConversationBreakLimit: (value: string) => void
  refreshCache: () => Promise<void>
}

export const useConversationExplorer = (): UseConversationExplorerResult => {
  const todayParts = useMemo<DateParts>(() => getTodayParts(), [])
  const [rootDir, setRootDir] = useState<string>('')
  const [conversationBreakLimit, setConversationBreakLimit] = useState<number>(10)
  const [isRefreshingCache, setIsRefreshingCache] = useState<boolean>(false)

  const [years, setYears] = useState<string[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [days, setDays] = useState<string[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [files, setFiles] = useState<SessionFile[]>([])

  const [year, setYear] = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [day, setDay] = useState<string>('')
  const [project, setProject] = useState<string>(ALL_PROJECTS)
  const [activeFile, setActiveFile] = useState<string>('')
  const [fileContent, setFileContent] = useState<string>('')

  const closePreview = useCallback((): void => {
    setActiveFile('')
    setFileContent('')
  }, [])

  // Reset dependent selectors when a higher-level date segment changes.
  const reset = useCallback((): void => {
    setMonths([])
    setDays([])
    setProjects([])
    setFiles([])
    setMonth('')
    setDay('')
    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
  }, [])

  const loadYears = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchJson<YearsResponse>(`${API}/years`)
      const options = toSorted(data.years || [])
      setYears(options)
      explorerLogger.log({
        event: 'client.explorer.years.loaded',
        fields: {
          year_count: options.length,
        },
      })
      setYear((prev) => {
        if (prev && options.includes(prev)) {
          return prev
        }

        const todayOption = pickDateOption(options, todayParts.year)
        if (todayOption) {
          return todayOption
        }

        return options[0] || ''
      })
    } catch (error) {
      explorerLogger.log({
        event: 'client.explorer.years.load_failed',
        level: 'warn',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {},
      })
      setYears([])
    }
  }, [todayParts.year])

  const loadMonths = useCallback(
    async (selectedYear: string): Promise<void> => {
      try {
        const data = await fetchJson<MonthsResponse>(
          `${API}/months?year=${encodeURIComponent(selectedYear)}`,
        )
        const options = toSorted(data.months || [])
        setMonths(options)
        explorerLogger.log({
          event: 'client.explorer.months.loaded',
          fields: {
            year: selectedYear,
            month_count: options.length,
          },
        })
        setMonth((prev) => {
          if (prev && options.includes(prev)) {
            return prev
          }

          if (
            normalizeNumericDatePart(selectedYear) === normalizeNumericDatePart(todayParts.year)
          ) {
            const todayOption = pickDateOption(options, todayParts.month)
            if (todayOption) {
              return todayOption
            }
          }

          return options[0] || ''
        })
      } catch (error) {
        explorerLogger.log({
          event: 'client.explorer.months.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            year: selectedYear,
          },
        })
        setMonths([])
      }
    },
    [todayParts.month, todayParts.year],
  )

  const loadDays = useCallback(
    async (selectedYear: string, selectedMonth: string): Promise<void> => {
      try {
        const data = await fetchJson<DaysResponse>(
          `${API}/days?year=${encodeURIComponent(selectedYear)}&month=${encodeURIComponent(selectedMonth)}`,
        )
        const options = toSorted(data.days || [])
        setDays(options)
        explorerLogger.log({
          event: 'client.explorer.days.loaded',
          fields: {
            year: selectedYear,
            month: selectedMonth,
            day_count: options.length,
          },
        })
        setDay((prev) => {
          if (prev && options.includes(prev)) {
            return prev
          }

          if (
            normalizeNumericDatePart(selectedYear) === normalizeNumericDatePart(todayParts.year) &&
            normalizeNumericDatePart(selectedMonth) === normalizeNumericDatePart(todayParts.month)
          ) {
            const todayOption = pickDateOption(options, todayParts.day)
            if (todayOption) {
              return todayOption
            }
          }

          return options[0] || ''
        })
      } catch (error) {
        explorerLogger.log({
          event: 'client.explorer.days.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            year: selectedYear,
            month: selectedMonth,
          },
        })
        setDays([])
      }
    },
    [todayParts.day, todayParts.month, todayParts.year],
  )

  const loadProjects = useCallback(
    async (
      selectedYear: string,
      selectedMonth: string,
      selectedDay: string,
      forceRefresh: boolean = false,
    ): Promise<void> => {
      try {
        const data = await fetchJson<ProjectsResponse>(
          `${API}/projects?year=${encodeURIComponent(selectedYear)}&month=${encodeURIComponent(
            selectedMonth,
          )}&day=${encodeURIComponent(selectedDay)}${forceRefresh ? '&refresh=1' : ''}`,
        )
        setProjects(data.projects || [])
        explorerLogger.log({
          event: 'client.explorer.projects.loaded',
          fields: {
            year: selectedYear,
            month: selectedMonth,
            day: selectedDay,
            force_refresh: forceRefresh,
            project_count: Array.isArray(data.projects) ? data.projects.length : 0,
          },
        })
      } catch (error) {
        explorerLogger.log({
          event: 'client.explorer.projects.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            year: selectedYear,
            month: selectedMonth,
            day: selectedDay,
            force_refresh: forceRefresh,
          },
        })
        setProjects([])
      }
    },
    [],
  )

  const loadFiles = useCallback(
    async (
      selectedYear: string,
      selectedMonth: string,
      selectedDay: string,
      selectedProject: string,
      selectedBreakLimit: number,
      forceRefresh: boolean = false,
    ): Promise<void> => {
      try {
        const data = await fetchJson<FilesResponse>(
          `${API}/files?year=${encodeURIComponent(selectedYear)}&month=${encodeURIComponent(
            selectedMonth,
          )}&day=${encodeURIComponent(selectedDay)}&project=${encodeURIComponent(
            selectedProject,
          )}&conversation_break_limit=${encodeURIComponent(selectedBreakLimit)}${forceRefresh ? '&refresh=1' : ''}`,
        )
        setFiles(Array.isArray(data.files) ? data.files : [])
        explorerLogger.log({
          event: 'client.explorer.files.loaded',
          fields: {
            year: selectedYear,
            month: selectedMonth,
            day: selectedDay,
            project: selectedProject,
            break_limit_minutes: selectedBreakLimit,
            force_refresh: forceRefresh,
            file_count: Array.isArray(data.files) ? data.files.length : 0,
          },
        })
      } catch (error) {
        explorerLogger.log({
          event: 'client.explorer.files.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            year: selectedYear,
            month: selectedMonth,
            day: selectedDay,
            project: selectedProject,
            break_limit_minutes: selectedBreakLimit,
            force_refresh: forceRefresh,
          },
        })
        setFiles([])
      }
    },
    [],
  )

  const loadPreview = useCallback(
    async (forceRefresh: boolean = false): Promise<void> => {
      if (!year || !month || !day || !activeFile) {
        setFileContent('')
        return
      }

      try {
        const content = await fetchText(
          `${API}/file?year=${encodeURIComponent(year)}&month=${encodeURIComponent(
            month,
          )}&day=${encodeURIComponent(day)}&project=${encodeURIComponent(project)}&file=${encodeURIComponent(
            activeFile,
          )}${forceRefresh ? '&refresh=1' : ''}`,
        )

        setFileContent(content)
        explorerLogger.log({
          event: 'client.explorer.preview.loaded',
          fields: {
            year,
            month,
            day,
            project,
            file: activeFile,
            force_refresh: forceRefresh,
            content_length: content.length,
          },
        })
      } catch (error) {
        explorerLogger.log({
          event: 'client.explorer.preview.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {
            year,
            month,
            day,
            project,
            file: activeFile,
            force_refresh: forceRefresh,
          },
        })
        setFileContent('')
      }
    },
    [activeFile, day, month, project, year],
  )

  const refreshCache = useCallback(async (): Promise<void> => {
    if (!year || !month || !day || isRefreshingCache) {
      return
    }

    explorerLogger.log({
      event: 'client.explorer.cache.refresh.start',
      fields: {
        year,
        month,
        day,
        project,
        has_preview: Boolean(activeFile),
      },
    })

    setIsRefreshingCache(true)
    try {
      await loadProjects(year, month, day, true)
      await loadFiles(year, month, day, project, conversationBreakLimit, true)
      if (activeFile) {
        await loadPreview(true)
      }
      explorerLogger.log({
        event: 'client.explorer.cache.refresh.success',
        fields: {
          year,
          month,
          day,
          project,
          has_preview: Boolean(activeFile),
        },
      })
    } catch (error) {
      explorerLogger.log({
        event: 'client.explorer.cache.refresh.failed',
        level: 'error',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {
          year,
          month,
          day,
          project,
          has_preview: Boolean(activeFile),
        },
      })
    } finally {
      setIsRefreshingCache(false)
    }
  }, [
    activeFile,
    conversationBreakLimit,
    day,
    isRefreshingCache,
    month,
    project,
    year,
    loadFiles,
    loadPreview,
    loadProjects,
  ])

  const updateConversationBreakLimit = useCallback((value: string): void => {
    const next = Number.parseInt(value, 10)
    const normalized = Number.isFinite(next) && next > 0 ? next : 1
    explorerLogger.log({
      event: 'client.explorer.break_limit.update',
      fields: {
        raw_value: value,
        normalized_value: normalized,
      },
    })
    setConversationBreakLimit(normalized)
  }, [])

  useEffect(() => {
    void loadYears()
    void fetchJson<RootResponse>(`${API}/root`)
      .then((data) => {
        setRootDir(data.root || '')
        explorerLogger.log({
          event: 'client.explorer.root.loaded',
          fields: {
            root: data.root || '',
            conversation_break_limit: Number(data.conversation_break_limit || 0),
          },
        })
        if (Number.isFinite(Number(data.conversation_break_limit))) {
          setConversationBreakLimit(Number(data.conversation_break_limit))
        }
      })
      .catch((error) => {
        explorerLogger.log({
          event: 'client.explorer.root.load_failed',
          level: 'warn',
          outcome: 'error',
          error: error instanceof Error ? error : String(error),
          fields: {},
        })
        setRootDir('')
      })
  }, [loadYears])

  useEffect(() => {
    if (!year) {
      reset()
      return
    }

    setMonth('')
    setDay('')
    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
    void loadMonths(year)
  }, [year, loadMonths, reset])

  useEffect(() => {
    if (!year || !month) {
      setDays([])
      setProjects([])
      return
    }

    setDay('')
    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
    void loadDays(year, month)
  }, [month, year, loadDays])

  useEffect(() => {
    if (!year || !month || !day) {
      setProjects([])
      return
    }

    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
    void loadProjects(year, month, day)
  }, [day, month, year, loadProjects])

  useEffect(() => {
    if (!year || !month || !day || !project) {
      setFiles([])
      return
    }

    void loadFiles(year, month, day, project, conversationBreakLimit)
  }, [project, day, month, year, conversationBreakLimit, loadFiles])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  return {
    rootDir,
    conversationBreakLimit,
    isRefreshingCache,
    years,
    months,
    days,
    projects,
    files,
    year,
    month,
    day,
    project,
    activeFile,
    fileContent,
    setYear,
    setMonth,
    setDay,
    setProject,
    setActiveFile,
    closePreview,
    updateConversationBreakLimit,
    refreshCache,
  }
}
