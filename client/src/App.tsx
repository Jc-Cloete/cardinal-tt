import {Flex, Heading, Text} from '@radix-ui/themes'
import {useEffect, useMemo, useState} from 'react'
import {ExplorerControls} from './components/ExplorerControls'
import {PreviewModal} from './components/PreviewModal'
import {ThemeToggle} from './components/ThemeToggle'
import {TimelinePanel} from './components/TimelinePanel'
import {CardinalDiffPanel} from './features/cardinal/CardinalDiffPanel'
import {useConversationExplorer} from './hooks/useConversationExplorer'
import type {SessionFile} from './types'
import {getProjectDisplayName} from './utils/display'
import {parsePreviewMessages} from './utils/preview'
import {buildCompressedTimeline} from './utils/timeline'

export default function App() {
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

  useEffect(() => {
    setExpandedMessageIds({})
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
          <Text as="p" className="header-subtitle">Browsing: {rootDir || 'loading...'}</Text>
        </div>
        <ThemeToggle />
      </Flex>

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

      <PreviewModal
        isOpen={Boolean(activeFile)}
        projectLabel={getProjectDisplayName(activeSession?.projectDir)}
        previewMessages={previewMessages}
        expandedMessageIds={expandedMessageIds}
        onClose={closePreview}
        onToggleMessage={toggleExpandedMessage}
      />
    </main>
  )
}
