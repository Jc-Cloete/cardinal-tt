import { Badge, Button, Card, Flex, Heading, ScrollArea, Text, TextField } from '@radix-ui/themes'
import { useMemo } from 'react'
import { useActivity } from './useActivity'

const formatDateTime = (iso: string): string => {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) {
    return iso
  }
  return new Date(parsed).toLocaleString()
}

export const ActivityPage = () => {
  const {
    day,
    fromTime,
    toTime,
    limit,
    loading,
    frames,
    windowEvents,
    selectedFrameIndex,
    selectedFrame,
    nearestWindowEvent,
    heartbeat,
    setDay,
    setFromTime,
    setToTime,
    setLimit,
    setSelectedFrameIndex,
    reload,
  } = useActivity()

  const heartbeatLabel = useMemo(() => {
    if (!heartbeat) {
      return 'Tracker offline'
    }
    if (!heartbeat.healthy) {
      return 'Tracker stale'
    }
    return 'Tracker healthy'
  }, [heartbeat])

  return (
    <Card className="card">
      <Flex justify="between" align="center" mb="3">
        <Heading size="6">Activity Scrubber</Heading>
        <Badge color={heartbeat?.healthy ? 'green' : 'red'}>{heartbeatLabel}</Badge>
      </Flex>

      <Flex gap="3" align="end" wrap="wrap" mb="3">
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
            max="10000"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </div>

        <Button onClick={() => void reload(true)} disabled={loading}>
          {loading ? 'Loading...' : 'Reload Activity'}
        </Button>
      </Flex>

      <div className="activity-layout">
        <div className="activity-viewer">
          {selectedFrame ? (
            <>
              <img
                src={selectedFrame.url}
                alt={`Activity frame at ${formatDateTime(selectedFrame.observedAt)}`}
                className="activity-main-image"
              />
              <Text size="2" className="activity-caption">
                {formatDateTime(selectedFrame.observedAt)}
              </Text>
              {nearestWindowEvent ? (
                <Text size="2" className="activity-caption">
                  {nearestWindowEvent.appName}
                  {nearestWindowEvent.windowTitle ? ` · ${nearestWindowEvent.windowTitle}` : ''}
                </Text>
              ) : null}
            </>
          ) : (
            <Text size="2" color="gray">
              No screenshots in this range.
            </Text>
          )}

          {frames.length > 1 ? (
            <input
              type="range"
              min="0"
              max={String(frames.length - 1)}
              value={String(selectedFrameIndex)}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setSelectedFrameIndex(Number.isFinite(next) ? next : 0)
              }}
            />
          ) : null}

          <ScrollArea type="auto" scrollbars="horizontal" className="activity-filmstrip-wrap">
            <div className="activity-filmstrip">
              {frames.map((frame, index) => (
                <button
                  key={frame.frameId}
                  type="button"
                  className={`activity-thumb ${index === selectedFrameIndex ? 'active' : ''}`}
                  onClick={() => setSelectedFrameIndex(index)}
                  title={formatDateTime(frame.observedAt)}
                >
                  <img src={frame.url} alt={`Frame ${index + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="activity-events">
          <Heading size="4" mb="2">
            Active Window Events
          </Heading>
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 460 }}>
            <div className="cardinal-list">
              {windowEvents.length === 0 ? (
                <Text size="2" color="gray">
                  No window events in this range.
                </Text>
              ) : null}
              {windowEvents.map((event) => (
                <article key={event.eventId} className="cardinal-entry-item">
                  <Text as="div" size="2" weight="bold">
                    {event.appName}
                  </Text>
                  {event.windowTitle ? (
                    <Text as="div" size="2" color="gray">
                      {event.windowTitle}
                    </Text>
                  ) : null}
                  <Text as="div" size="1" color="gray">
                    {formatDateTime(event.observedAt)}
                  </Text>
                </article>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Card>
  )
}
