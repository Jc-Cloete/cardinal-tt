import { Button, Card, Flex, Heading, ScrollArea, Select, Text, TextField } from '@radix-ui/themes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { API } from '../../constants'
import { fetchJson } from '../../utils/fetch'
import type { CardinalDiffEntry, CardinalEventsResponse, CardinalProject } from './types'

type CardinalEventsPageProps = {
  projects: CardinalProject[]
}

const dateTimeToNs = (dateValue: string, timeValue: string): number | null => {
  if (!dateValue || !timeValue) {
    return null
  }
  const timestamp = Date.parse(`${dateValue}T${timeValue}:00`)
  return Number.isFinite(timestamp) ? timestamp * 1_000_000 : null
}

const formatNs = (value: number): string =>
  value > 0 ? new Date(Math.floor(value / 1_000_000)).toLocaleString() : '--'

const getTodayDate = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const CardinalEventsPage = ({ projects }: CardinalEventsPageProps) => {
  // Time-range filters are kept local so event browsing remains independent from explorer page state.
  const [projectId, setProjectId] = useState<string>('')
  const [day, setDay] = useState<string>(getTodayDate())
  const [fromTime, setFromTime] = useState<string>('00:00')
  const [toTime, setToTime] = useState<string>('23:59')
  const [limit, setLimit] = useState<string>('1000')
  const [loading, setLoading] = useState<boolean>(false)
  const [events, setEvents] = useState<CardinalDiffEntry[]>([])

  useEffect(() => {
    setProjectId((prev) => {
      if (prev && projects.some((project) => project.projectId === prev)) {
        return prev
      }
      return projects[0]?.projectId || ''
    })
  }, [projects])

  const rangeNs = useMemo(
    () => ({
      sinceNs: dateTimeToNs(day, fromTime),
      untilNs: dateTimeToNs(day, toTime),
    }),
    [day, fromTime, toTime],
  )

  const loadEvents = useCallback(async (): Promise<void> => {
    if (!projectId || rangeNs.sinceNs === null || rangeNs.untilNs === null) {
      setEvents([])
      return
    }

    const parsedLimit = Number.parseInt(limit, 10)
    const boundedLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 5000))
      : 1000

    setLoading(true)
    try {
      const response = await fetchJson<CardinalEventsResponse>(
        `${API}/cardinal/events?project_id=${encodeURIComponent(projectId)}&since_ns=${encodeURIComponent(
          String(rangeNs.sinceNs),
        )}&until_ns=${encodeURIComponent(String(rangeNs.untilNs))}&limit=${encodeURIComponent(String(boundedLimit))}`,
      )
      setEvents(Array.isArray(response.events) ? response.events : [])
    } finally {
      setLoading(false)
    }
  }, [projectId, rangeNs.sinceNs, rangeNs.untilNs, limit])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return (
    <Card className="card">
      <Heading size="6" mb="3">
        CardinalDiff Event Stream
      </Heading>

      <Flex gap="3" align="end" wrap="wrap" mb="3">
        <div className="control-field">
          <Text size="2">Project</Text>
          <Select.Root value={projectId || undefined} onValueChange={setProjectId}>
            <Select.Trigger placeholder="Select tracked project" />
            <Select.Content>
              {projects.map((project) => (
                <Select.Item key={project.projectId} value={project.projectId}>
                  {project.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <div className="control-field">
          <Text size="2">Day</Text>
          <TextField.Root
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>

        <div className="control-field">
          <Text size="2">From</Text>
          <TextField.Root
            type="time"
            value={fromTime}
            onChange={(event) => setFromTime(event.target.value)}
          />
        </div>

        <div className="control-field">
          <Text size="2">To</Text>
          <TextField.Root
            type="time"
            value={toTime}
            onChange={(event) => setToTime(event.target.value)}
          />
        </div>

        <div className="control-field">
          <Text size="2">Limit</Text>
          <TextField.Root
            type="number"
            min="1"
            max="5000"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </div>

        <Button onClick={() => void loadEvents()} disabled={loading || !projectId}>
          {loading ? 'Loading...' : 'Reload Events'}
        </Button>
      </Flex>

      <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 520 }}>
        <div className="cardinal-list">
          {events.length === 0 ? (
            <Text size="2" color="gray">
              No events in the selected range.
            </Text>
          ) : null}
          {events.map((event, index) => (
            <article
              key={`${event.commitId}-${event.relPath}-${index}`}
              className="cardinal-entry-item"
            >
              <Flex align="center" gap="2" mb="1">
                <Text size="1" color="gray">
                  #{event.sequenceNo}
                </Text>
                <Text size="2" weight="bold">
                  {event.op}
                </Text>
                <Text size="2">{event.relPath}</Text>
              </Flex>
              {event.oldRelPath ? (
                <Text as="div" size="1" color="gray">
                  from: {event.oldRelPath}
                </Text>
              ) : null}
              <Text as="div" size="1" color="gray">
                {formatNs(event.startedAtNs)} to {formatNs(event.endedAtNs)}
              </Text>
            </article>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
