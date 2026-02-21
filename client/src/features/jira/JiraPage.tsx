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

export const JiraPage = () => {
  const {
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

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.issueKey === selectedIssueKey) || null,
    [issues, selectedIssueKey],
  )

  useEffect(() => {
    setSelectedTransitionId((prev) => {
      if (prev && transitions.some((transition) => transition.transitionId === prev)) {
        return prev
      }
      return transitions[0]?.transitionId || ''
    })
  }, [transitions])

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

        <Button onClick={() => void refreshProjects(false)} disabled={loading}>
          Reload Projects
        </Button>
        <Button onClick={() => void refreshProjects(true)} disabled={loading} variant="soft">
          Force Refresh Projects
        </Button>
        <Button onClick={() => void refreshIssues(false)} disabled={loading || !selectedProjectKey}>
          Reload Tickets
        </Button>
        <Button
          onClick={() => void refreshIssues(true)}
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
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 420 }}>
            <div className="cardinal-list">
              {issues.length === 0 ? (
                <Text size="2" color="gray">
                  No Jira tickets for selected project.
                </Text>
              ) : null}
              {issues.map((issue) => (
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
