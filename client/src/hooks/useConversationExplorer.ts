import {useCallback, useEffect, useMemo, useState} from 'react'
import {ALL_PROJECTS, API} from '../constants'
import type {DateParts, DaysResponse, FilesResponse, MonthsResponse, ProjectsResponse, RootResponse, SessionFile, YearsResponse} from '../types'
import {getTodayParts, normalizeNumericDatePart, pickDateOption, toSorted} from '../utils/date'
import {fetchJson} from '../utils/fetch'

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

  const reset = (): void => {
    setMonths([])
    setDays([])
    setProjects([])
    setFiles([])
    setMonth('')
    setDay('')
    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
  }

  const loadYears = async (): Promise<void> => {
    try {
      const data = await fetchJson<YearsResponse>(`${API}/years`)
      const options = toSorted(data.years || [])
      setYears(options)
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
    } catch {
      setYears([])
    }
  }

  const loadMonths = async (selectedYear: string): Promise<void> => {
    try {
      const data = await fetchJson<MonthsResponse>(`${API}/months?year=${encodeURIComponent(selectedYear)}`)
      const options = toSorted(data.months || [])
      setMonths(options)
      setMonth((prev) => {
        if (prev && options.includes(prev)) {
          return prev
        }

        if (normalizeNumericDatePart(selectedYear) === normalizeNumericDatePart(todayParts.year)) {
          const todayOption = pickDateOption(options, todayParts.month)
          if (todayOption) {
            return todayOption
          }
        }

        return options[0] || ''
      })
    } catch {
      setMonths([])
    }
  }

  const loadDays = async (selectedYear: string, selectedMonth: string): Promise<void> => {
    try {
      const data = await fetchJson<DaysResponse>(
        `${API}/days?year=${encodeURIComponent(selectedYear)}&month=${encodeURIComponent(selectedMonth)}`,
      )
      const options = toSorted(data.days || [])
      setDays(options)
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
    } catch {
      setDays([])
    }
  }

  const loadProjects = async (
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
    } catch {
      setProjects([])
    }
  }

  const loadFiles = async (
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
    } catch {
      setFiles([])
    }
  }

  const loadPreview = async (forceRefresh: boolean = false): Promise<void> => {
    if (!year || !month || !day || !activeFile) {
      setFileContent('')
      return
    }

    try {
      const response = await fetch(
        `${API}/file?year=${encodeURIComponent(year)}&month=${encodeURIComponent(
          month,
        )}&day=${encodeURIComponent(day)}&project=${encodeURIComponent(project)}&file=${encodeURIComponent(
          activeFile,
        )}${forceRefresh ? '&refresh=1' : ''}`,
      )

      if (!response.ok) {
        setFileContent('')
        return
      }

      setFileContent(await response.text())
    } catch {
      setFileContent('')
    }
  }

  const refreshCache = useCallback(async (): Promise<void> => {
    if (!year || !month || !day || isRefreshingCache) {
      return
    }

    setIsRefreshingCache(true)
    try {
      await loadProjects(year, month, day, true)
      await loadFiles(year, month, day, project, conversationBreakLimit, true)
      if (activeFile) {
        await loadPreview(true)
      }
    } finally {
      setIsRefreshingCache(false)
    }
  }, [activeFile, conversationBreakLimit, day, isRefreshingCache, month, project, year])

  const updateConversationBreakLimit = useCallback((value: string): void => {
    const next = Number.parseInt(value, 10)
    setConversationBreakLimit(Number.isFinite(next) && next > 0 ? next : 1)
  }, [])

  useEffect(() => {
    void loadYears()
    void fetchJson<RootResponse>(`${API}/root`)
      .then((data) => {
        setRootDir(data.root || '')
        if (Number.isFinite(Number(data.conversation_break_limit))) {
          setConversationBreakLimit(Number(data.conversation_break_limit))
        }
      })
      .catch(() => {
        setRootDir('')
      })
  }, [])

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
  }, [year])

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
  }, [month, year])

  useEffect(() => {
    if (!year || !month || !day) {
      setProjects([])
      return
    }

    setProject(ALL_PROJECTS)
    setActiveFile('')
    setFileContent('')
    void loadProjects(year, month, day)
  }, [day, month, year])

  useEffect(() => {
    if (!year || !month || !day || !project) {
      setFiles([])
      return
    }

    void loadFiles(year, month, day, project, conversationBreakLimit)
  }, [project, day, month, year, conversationBreakLimit])

  useEffect(() => {
    void loadPreview()
  }, [activeFile, project, day, month, year])

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
