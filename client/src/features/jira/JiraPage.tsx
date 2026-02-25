import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  ScrollArea,
  Select,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes'
import { useEffect, useMemo, useState } from 'react'
import { MultiSelectDropdown } from '../../components/MultiSelectDropdown'
import { useToast } from '../../notifications/ToastProvider'
import type { JiraDefaultSettings } from '../settings/types'
import { useJira } from './useJira'

const formatSyncLabel = (syncedAt: string | null): string => {
  if (!syncedAt) {
    return 'never'
  }
  const timestamp = Date.parse(syncedAt)
  if (!Number.isFinite(timestamp)) {
    return syncedAt
  }
  return new Date(timestamp).toLocaleString()
}

type JiraPageProps = {
  defaults: JiraDefaultSettings
}

const matchDefaultFilters = (defaults: string[], options: string[]): string[] => {
  const optionLookup = new Map<string, string>()
  for (const option of options) {
    const normalized = option.trim().toLowerCase()
    if (normalized.length > 0 && !optionLookup.has(normalized)) {
      optionLookup.set(normalized, option)
    }
  }

  const selected: string[] = []
  for (const value of defaults) {
    const normalized = value.trim().toLowerCase()
    const match = optionLookup.get(normalized)
    if (match && !selected.includes(match)) {
      selected.push(match)
    }
  }

  return selected
}

export const JiraPage = ({ defaults }: JiraPageProps) => {
  const { info: showInfoToast } = useToast()
  const {
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
    addComment,
    moveStatus,
    createIssue,
  } = useJira()

  const [commentText, setCommentText] = useState<string>('')
  const [selectedTransitionId, setSelectedTransitionId] = useState<string>('')
  const [newTitle, setNewTitle] = useState<string>('')
  const [newDescription, setNewDescription] = useState<string>('')
  const [newStatusName, setNewStatusName] = useState<string>('')
  const [newIssueTypeName, setNewIssueTypeName] = useState<string>('Task')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [hasAppliedProjectDefault, setHasAppliedProjectDefault] = useState<boolean>(false)
  const [defaultsAppliedForProjectKey, setDefaultsAppliedForProjectKey] = useState<string>('')

  const statusFilterOptions = useMemo(
    () =>
      Array.from(new Set(issues.map((issue) => issue.statusName || 'Unknown status'))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [issues],
  )

  const assigneeFilterOptions = useMemo(
    () =>
      Array.from(new Set(issues.map((issue) => issue.assigneeDisplayName || 'Unassigned'))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [issues],
  )

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        const status = issue.statusName || 'Unknown status'
        const assignee = issue.assigneeDisplayName || 'Unassigned'
        const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(status)
        const assigneeMatch = selectedAssignees.length === 0 || selectedAssignees.includes(assignee)
        return statusMatch && assigneeMatch
      }),
    [issues, selectedAssignees, selectedStatuses],
  )

  const selectedIssue = useMemo(
    () => filteredIssues.find((issue) => issue.issueKey === selectedIssueKey) || null,
    [filteredIssues, selectedIssueKey],
  )

  useEffect(() => {
    setSelectedTransitionId((prev) => {
      if (prev && transitions.some((transition) => transition.transitionId === prev)) {
        return prev
      }
      return transitions[0]?.transitionId || ''
    })
  }, [transitions])

  useEffect(() => {
    if (hasAppliedProjectDefault || projects.length === 0) {
      return
    }

    const defaultProjectKey = defaults.defaultProjectKey.trim()
    if (defaultProjectKey && projects.some((project) => project.projectKey === defaultProjectKey)) {
      setSelectedProjectKey(defaultProjectKey)
    }
    setHasAppliedProjectDefault(true)
  }, [defaults.defaultProjectKey, hasAppliedProjectDefault, projects, setSelectedProjectKey])

  useEffect(() => {
    if (!selectedProjectKey || defaultsAppliedForProjectKey === selectedProjectKey) {
      return
    }
    if (loadedIssuesProjectKey !== selectedProjectKey) {
      return
    }

    const issuesBelongToSelectedProject =
      issues.length === 0 || issues.every((issue) => issue.projectKey === selectedProjectKey)
    if (!issuesBelongToSelectedProject) {
      return
    }

    setSelectedStatuses(matchDefaultFilters(defaults.defaultStatusFilters, statusFilterOptions))
    setSelectedAssignees(
      matchDefaultFilters(defaults.defaultAssigneeFilters, assigneeFilterOptions),
    )
    setDefaultsAppliedForProjectKey(selectedProjectKey)
  }, [
    assigneeFilterOptions,
    defaultsAppliedForProjectKey,
    defaults.defaultAssigneeFilters,
    defaults.defaultStatusFilters,
    selectedProjectKey,
    loadedIssuesProjectKey,
    issues,
    statusFilterOptions,
  ])

  useEffect(() => {
    if (filteredIssues.length === 0) {
      if (selectedIssueKey) {
        setSelectedIssueKey('')
      }
      return
    }

    if (!filteredIssues.some((issue) => issue.issueKey === selectedIssueKey)) {
      setSelectedIssueKey(filteredIssues[0]?.issueKey || '')
    }
  }, [filteredIssues, selectedIssueKey, setSelectedIssueKey])

  useEffect(() => {
    setSelectedStatuses((prev) => prev.filter((value) => statusFilterOptions.includes(value)))
  }, [statusFilterOptions])

  useEffect(() => {
    setSelectedAssignees((prev) => prev.filter((value) => assigneeFilterOptions.includes(value)))
  }, [assigneeFilterOptions])

  return (
    <Card className="card">
      <Heading size="6" mb="3">
        Jira Workbench
      </Heading>

      <Flex gap="3" align="end" wrap="wrap" mb="3">
        <div className="control-field">
          <Text size="2">Project</Text>
          <Select.Root
            value={selectedProjectKey || undefined}
            onValueChange={setSelectedProjectKey}
          >
            <Select.Trigger placeholder="Select Jira project" />
            <Select.Content>
              {projects.map((project) => (
                <Select.Item key={project.projectKey} value={project.projectKey}>
                  {project.projectKey} · {project.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <Button onClick={() => void refreshProjects(false, true)} disabled={loading}>
          Reload Projects
        </Button>
        <Button onClick={() => void refreshProjects(true, true)} disabled={loading} variant="soft">
          Force Refresh Projects
        </Button>
        <Button
          onClick={() => void refreshIssues(false, true)}
          disabled={loading || !selectedProjectKey}
        >
          Reload Tickets
        </Button>
        <Button
          onClick={() => void refreshIssues(true, true)}
          disabled={loading || !selectedProjectKey}
          variant="soft"
        >
          Force Refresh Tickets
        </Button>
      </Flex>

      <Flex gap="2" mb="3" wrap="wrap">
        {projectsSync ? (
          <Badge color={projectsSync.stale ? 'orange' : 'green'}>
            Projects: {projectsSync.source} · {formatSyncLabel(projectsSync.syncedAt)}
          </Badge>
        ) : null}
        {issuesSync ? (
          <Badge color={issuesSync.stale ? 'orange' : 'green'}>
            Issues: {issuesSync.source} · {formatSyncLabel(issuesSync.syncedAt)}
          </Badge>
        ) : null}
      </Flex>

      {error ? (
        <Text as="p" color="red" size="2" mb="3">
          {error}
        </Text>
      ) : null}

      <Flex gap="3" wrap="wrap">
        <div style={{ flex: 1, minWidth: 300 }}>
          <Heading size="4" mb="2">
            Tickets
          </Heading>
          <Flex gap="2" mb="2" wrap="wrap" align="start">
            <MultiSelectDropdown
              label="Status"
              options={statusFilterOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              anyLabel="Any"
              searchPlaceholder="Search statuses..."
            />
            <MultiSelectDropdown
              label="Assignee"
              options={assigneeFilterOptions}
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
              anyLabel="Any"
              searchPlaceholder="Search assignees..."
            />
            <Button
              variant="soft"
              onClick={() => {
                setSelectedStatuses([])
                setSelectedAssignees([])
                showInfoToast('Filters cleared', 'Status and assignee filters were reset.')
              }}
            >
              Clear Filters
            </Button>
          </Flex>
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 420 }}>
            <div className="cardinal-list">
              {filteredIssues.length === 0 ? (
                <Text size="2" color="gray">
                  {issues.length === 0
                    ? 'No Jira tickets for selected project.'
                    : 'No tickets match the selected filters.'}
                </Text>
              ) : null}
              {filteredIssues.map((issue) => (
                <button
                  key={issue.issueKey}
                  type="button"
                  className={`jira-ticket-row${issue.issueKey === selectedIssueKey ? ' is-active' : ''}`}
                  onClick={() => setSelectedIssueKey(issue.issueKey)}
                >
                  <Text as="div" size="2" weight="bold">
                    {issue.issueKey} · {issue.summary}
                  </Text>
                  <Text as="div" size="1" color="gray">
                    {issue.statusName || 'Unknown status'} · {issue.issueType || 'Unknown type'}
                  </Text>
                  <Text as="div" size="1" color="gray">
                    {issue.assigneeDisplayName || 'Unassigned'} ·{' '}
                    {issue.priorityName || 'No priority'}
                  </Text>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <Heading size="4" mb="2">
            Ticket Actions
          </Heading>
          <Card variant="surface" mb="3">
            <Text as="p" size="2" mb="2">
              Selected:{' '}
              {selectedIssue
                ? `${selectedIssue.issueKey} (${selectedIssue.statusName || 'unknown'})`
                : 'none'}
            </Text>

            <Text as="label" size="2">
              Add comment
            </Text>
            <TextArea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Add context from timeline/diff analysis"
              rows={4}
            />
            <Flex mt="2" justify="end">
              <Button
                disabled={!selectedIssue || !commentText.trim() || mutating}
                onClick={() => {
                  if (!selectedIssue) {
                    return
                  }
                  void addComment(selectedIssue.issueKey, commentText.trim()).then(() =>
                    setCommentText(''),
                  )
                }}
              >
                Add Comment
              </Button>
            </Flex>

            <Text as="label" size="2" mt="3" style={{ display: 'block' }}>
              Move status
            </Text>
            <Flex gap="2" align="center">
              <Select.Root
                value={selectedTransitionId || undefined}
                onValueChange={setSelectedTransitionId}
              >
                <Select.Trigger placeholder="Select transition" />
                <Select.Content>
                  {transitions.map((transition) => (
                    <Select.Item key={transition.transitionId} value={transition.transitionId}>
                      {transition.toStatusName || transition.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Button
                disabled={!selectedIssue || !selectedTransitionId || mutating}
                onClick={() => {
                  if (!selectedIssue) {
                    return
                  }
                  void moveStatus({
                    issueKey: selectedIssue.issueKey,
                    statusId: selectedTransitionId,
                  })
                }}
              >
                Move
              </Button>
            </Flex>
          </Card>

          <Card variant="surface">
            <Heading size="3" mb="2">
              Create Ticket
            </Heading>
            <div className="control-field">
              <Text size="2">Title</Text>
              <TextField.Root
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Issue title"
              />
            </div>
            <div className="control-field">
              <Text size="2">Description</Text>
              <TextArea
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Issue description"
                rows={4}
              />
            </div>
            <Flex gap="2">
              <div className="control-field" style={{ flex: 1 }}>
                <Text size="2">Status (optional)</Text>
                <TextField.Root
                  value={newStatusName}
                  onChange={(event) => setNewStatusName(event.target.value)}
                  placeholder="e.g. In Progress"
                />
              </div>
              <div className="control-field" style={{ flex: 1 }}>
                <Text size="2">Issue Type</Text>
                <TextField.Root
                  value={newIssueTypeName}
                  onChange={(event) => setNewIssueTypeName(event.target.value)}
                  placeholder="Task"
                />
              </div>
            </Flex>
            <Flex justify="end" mt="2">
              <Button
                disabled={
                  !selectedProjectKey || !newTitle.trim() || !newDescription.trim() || mutating
                }
                onClick={() => {
                  void createIssue({
                    projectKey: selectedProjectKey,
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    statusName: newStatusName.trim() || undefined,
                    issueTypeName: newIssueTypeName.trim() || undefined,
                  }).then(() => {
                    setNewTitle('')
                    setNewDescription('')
                    setNewStatusName('')
                  })
                }}
              >
                Create Ticket
              </Button>
            </Flex>
          </Card>
        </div>
      </Flex>
    </Card>
  )
}
