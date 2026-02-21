import {ReloadIcon} from '@radix-ui/react-icons'
import {Badge, Button, Card, Flex, Heading, ScrollArea, Select, Separator, Text} from '@radix-ui/themes'
import {useCardinalDiff} from './useCardinalDiff'

const formatNs = (value: number): string =>
  value > 0 ? new Date(Math.floor(value / 1_000_000)).toLocaleString() : '--'

export const CardinalDiffPanel = () => {
  const {
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
  } = useCardinalDiff()

  const selectedProject = projects.find((project) => project.projectId === selectedProjectId) || null

  return (
    <Card className="card">
      <Flex justify="between" align="center" gap="3" wrap="wrap" mb="3">
        <Heading size="5">Cardinal Diff Events</Heading>
        <Flex gap="2" align="center">
          <Select.Root value={selectedProjectId || undefined} onValueChange={setSelectedProjectId}>
            <Select.Trigger placeholder="Select tracked project" />
            <Select.Content>
              {projects.map((project) => (
                <Select.Item value={project.projectId} key={project.projectId}>
                  {project.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button variant="soft" onClick={() => void refresh()} disabled={loading}>
            <ReloadIcon width={14} height={14} />
            Refresh
          </Button>
        </Flex>
      </Flex>

      {selectedProject ? (
        <Text as="p" size="2" className="empty">
          Root: {selectedProject.rootPath} | Mode: {selectedProject.mode} | Hash policy: {selectedProject.hashPolicy}
        </Text>
      ) : null}

      <Flex gap="2" align="center" mb="3" wrap="wrap">
        <Text size="2" weight="bold">Compare from</Text>
        <Select.Root value={compareFromCommitId || undefined} onValueChange={setCompareFromCommitId}>
          <Select.Trigger placeholder="Older commit" />
          <Select.Content>
            {commits.map((commit) => (
              <Select.Item value={commit.commitId} key={`from-${commit.commitId}`}>
                #{commit.sequenceNo} ({commit.changeCount})
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Text size="2" weight="bold">to</Text>
        <Select.Root value={selectedCommitId || undefined} onValueChange={setSelectedCommitId}>
          <Select.Trigger placeholder="Newer commit" />
          <Select.Content>
            {commits.map((commit) => (
              <Select.Item value={commit.commitId} key={`to-${commit.commitId}`}>
                #{commit.sequenceNo} ({commit.changeCount})
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <div className="cardinal-grid">
        <section className="cardinal-column">
          <Text size="2" weight="bold">Commits</Text>
          <ScrollArea type="auto" scrollbars="vertical" className="cardinal-scroll">
            <div className="cardinal-list">
              {commits.length === 0 ? (
                <Text size="2" color="gray">No commits found.</Text>
              ) : null}
              {commits.map((commit) => (
                <button
                  type="button"
                  key={commit.commitId}
                  className={`cardinal-commit-item ${commit.commitId === selectedCommitId ? 'active' : ''}`}
                  onClick={() => setSelectedCommitId(commit.commitId)}
                >
                  <span className="cardinal-commit-top">
                    <strong>#{commit.sequenceNo}</strong>
                    <Badge color="cyan">{commit.changeCount} changes</Badge>
                  </span>
                  <small>{formatNs(commit.startedAtNs)} - {formatNs(commit.endedAtNs)}</small>
                </button>
              ))}
            </div>
          </ScrollArea>
        </section>

        <section className="cardinal-column">
          <Text size="2" weight="bold">Entries</Text>
          <Separator size="4" my="2" />
          <ScrollArea type="auto" scrollbars="vertical" className="cardinal-scroll">
            <div className="cardinal-list">
              {selectedCommitId && commitEntries.length === 0 ? (
                <Text size="2" color="gray">No entries for selected commit.</Text>
              ) : null}
              {commitEntries.map((entry, index) => (
                <article key={`${entry.relPath}-${entry.op}-${index}`} className="cardinal-entry-item">
                  <Flex align="center" gap="2" mb="1">
                    <Badge color="blue">{entry.op}</Badge>
                    <Text size="2" weight="medium">{entry.relPath}</Text>
                  </Flex>
                  {entry.oldRelPath ? (
                    <Text as="div" size="1" color="gray">from: {entry.oldRelPath}</Text>
                  ) : null}
                </article>
              ))}
            </div>
          </ScrollArea>
        </section>

        <section className="cardinal-column">
          <Text size="2" weight="bold">Range Diff</Text>
          <Separator size="4" my="2" />
          <ScrollArea type="auto" scrollbars="vertical" className="cardinal-scroll">
            <div className="cardinal-list">
              {diffEntries.length === 0 ? (
                <Text size="2" color="gray">No entries in selected commit range.</Text>
              ) : null}
              {diffEntries.map((entry, index) => (
                <article key={`${entry.commitId}-${entry.relPath}-${index}`} className="cardinal-entry-item">
                  <Flex align="center" gap="2" mb="1">
                    <Badge color="iris">#{entry.sequenceNo}</Badge>
                    <Badge color="blue">{entry.op}</Badge>
                    <Badge color={entry.diffKind === 'text' ? 'green' : entry.diffKind === 'metadata' ? 'gray' : 'orange'}>
                      {entry.diffKind}
                    </Badge>
                  </Flex>
                  <Text size="2" weight="medium">{entry.relPath}</Text>
                  {entry.oldRelPath ? (
                    <Text as="div" size="1" color="gray">from: {entry.oldRelPath}</Text>
                  ) : null}
                </article>
              ))}
            </div>
          </ScrollArea>
        </section>
      </div>
    </Card>
  )
}
