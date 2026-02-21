import { Button, Flex, Heading, Text } from '@radix-ui/themes'
import { useEffect, useMemo, useState } from 'react'
import { ExplorerControls } from './components/ExplorerControls'
import { PreviewModal } from './components/PreviewModal'
import { ThemeToggle } from './components/ThemeToggle'
import { TimelinePanel } from './components/TimelinePanel'
import { ALL_PROJECTS, UNKNOWN_PROJECT } from './constants'
import { CardinalDiffPanel } from './features/cardinal/CardinalDiffPanel'
import { CardinalEventsPage } from './features/cardinal/CardinalEventsPage'
import { CardinalHeartbeatBadge } from './features/cardinal/CardinalHeartbeatBadge'
import { useCardinalStatus } from './features/cardinal/useCardinalStatus'
import { JiraPage } from './features/jira/JiraPage'
import { useConversationExplorer } from './hooks/useConversationExplorer'
import { clientLogger } from './observability/logger'
import type { SessionFile } from './types'
import { getProjectDisplayName } from './utils/display'
import { parsePreviewMessages } from './utils/preview'
import { buildCompressedTimeline } from './utils/timeline'

type AppPage = 'explorer' | 'events' | 'jira'

const appLogger = clientLogger.child({ component: 'app' })

export default function App() {
  // Keep page-level orchestration in one place; data concerns live in dedicated hooks/features.
  const {
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
  } = useConversationExplorer()
  const {
    projects: trackedProjects,
    heartbeat,
    loading: cardinalLoading,
    mutating: cardinalMutating,
    getTrackedProjectByRootPath,
    trackProject,
    untrackProject,
  } = useCardinalStatus()

  const [page, setPage] = useState<AppPage>('explorer')

  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({})

  const previewMessages = useMemo(() => parsePreviewMessages(fileContent), [fileContent])
  const timelineModel = useMemo(
    () => buildCompressedTimeline(files, year, month, day, conversationBreakLimit),
    [files, year, month, day, conversationBreakLimit],
  )

  const activeSession = useMemo<SessionFile | null>(
    () => files.find((item) => item.name === activeFile) || null,
    [files, activeFile],
  )

  const activeProjectPath = useMemo(() => {
    const candidate = activeSession?.projectDir || ''
    if (!candidate || candidate === ALL_PROJECTS || candidate === UNKNOWN_PROJECT) {
      return ''
    }
    return candidate
  }, [activeSession?.projectDir])

  const trackedProject = useMemo(
    () => (activeProjectPath ? getTrackedProjectByRootPath(activeProjectPath) : null),
    [activeProjectPath, getTrackedProjectByRootPath],
  )

  useEffect(() => {
    setExpandedMessageIds({})
  }, [])

  useEffect(() => {
    appLogger.log({
      event: 'client.app.page.changed',
      fields: {
        page,
      },
    })
  }, [page])

  useEffect(() => {
    appLogger.log({
      event: 'client.app.preview.selection',
      fields: {
        active_file: activeFile || null,
        has_active_file: Boolean(activeFile),
      },
    })
  }, [activeFile])

  useEffect(() => {
    if (!activeFile) {
      return undefined
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closePreview()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFile, closePreview])

  const toggleExpandedMessage = (messageId: string): void => {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  return (
    <main className="page">
      <Flex className="header" justify="between" align="start" gap="4">
        <div>
          <Heading size="8">Conversation Data Explorer</Heading>
          <Text as="p" className="header-subtitle">
            Browsing: {rootDir || 'loading...'}
          </Text>
          <CardinalHeartbeatBadge heartbeat={heartbeat} />
        </div>
        <Flex align="center" gap="2">
          <Button
            variant={page === 'explorer' ? 'solid' : 'soft'}
            onClick={() => setPage('explorer')}
          >
            Explorer
          </Button>
          <Button variant={page === 'events' ? 'solid' : 'soft'} onClick={() => setPage('events')}>
            Events
          </Button>
          <Button variant={page === 'jira' ? 'solid' : 'soft'} onClick={() => setPage('jira')}>
            Jira
          </Button>
          <ThemeToggle />
        </Flex>
      </Flex>

      {page === 'explorer' ? (
        <>
          <ExplorerControls
            years={years}
            months={months}
            days={days}
            projects={projects}
            year={year}
            month={month}
            day={day}
            project={project}
            conversationBreakLimit={conversationBreakLimit}
            isRefreshingCache={isRefreshingCache}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onDayChange={setDay}
            onProjectChange={setProject}
            onBreakLimitChange={updateConversationBreakLimit}
            onRefreshCache={refreshCache}
          />

          <TimelinePanel
            day={day}
            timelineModel={timelineModel}
            activeFile={activeFile}
            onSelectFile={setActiveFile}
          />

          <CardinalDiffPanel />
        </>
      ) : page === 'events' ? (
        <CardinalEventsPage projects={trackedProjects} />
      ) : (
        <JiraPage />
      )}

      <PreviewModal
        isOpen={Boolean(activeFile)}
        projectPath={activeProjectPath}
        projectLabel={getProjectDisplayName(activeSession?.projectDir)}
        trackedProject={trackedProject}
        trackingBusy={cardinalLoading || cardinalMutating}
        previewMessages={previewMessages}
        expandedMessageIds={expandedMessageIds}
        onTrackProject={trackProject}
        onUntrackProject={untrackProject}
        onClose={closePreview}
        onToggleMessage={toggleExpandedMessage}
      />
    </main>
  )
}
