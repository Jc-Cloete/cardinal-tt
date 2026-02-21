import { Card, Heading, Text } from '@radix-ui/themes'
import type { TimelineModel } from '../types'
import { formatTime } from '../utils/date'
import { getProjectDisplayName } from '../utils/display'

type TimelinePanelProps = {
  day: string
  timelineModel: TimelineModel
  activeFile: string
  onSelectFile: (name: string) => void
}

export const TimelinePanel = ({
  day,
  timelineModel,
  activeFile,
  onSelectFile,
}: TimelinePanelProps) => (
  // Renders precomputed timeline sections/ticks/lanes from buildCompressedTimeline().
  <section className="content content-single">
    <Card className="card">
      <Heading size="6" mb="2">
        Conversations Timeline
      </Heading>
      {!day ? (
        <Text as="div" className="empty">
          Pick year, month, and day to view timeline.
        </Text>
      ) : null}
      {day && !timelineModel.hasData ? (
        <Text as="div" className="empty">
          No conversations found for this level.
        </Text>
      ) : null}
      {timelineModel.rangeStartMs && timelineModel.rangeEndMs ? (
        <Text as="div" size="2" className="timeline-range">
          Range: {formatTime(timelineModel.rangeStartMs, true)} to{' '}
          {formatTime(timelineModel.rangeEndMs, true)}
        </Text>
      ) : null}
      {timelineModel.sections.length > 0 ? (
        <div className="timeline-scroll">
          <div className="timeline-stack">
            {timelineModel.sections.map((section, sectionIndex) => (
              <div key={section.id}>
                {sectionIndex > 0 ? (
                  <div className="timeline-gap-marker">
                    <span>
                      Compressed idle gap: {timelineModel.gaps[sectionIndex - 1]?.durationLabel}
                    </span>
                    <small>
                      {timelineModel.gaps[sectionIndex - 1]?.fromLabel} to{' '}
                      {timelineModel.gaps[sectionIndex - 1]?.toLabel}
                    </small>
                  </div>
                ) : null}
                <div
                  className="timeline-shell"
                  style={{ minHeight: `${section.sectionHeightPx}px` }}
                >
                  <div className="timeline-axis">
                    {section.ticks.map((tick) => (
                      <span key={tick.key} style={{ top: `${tick.topPct}%` }}>
                        {tick.label}
                      </span>
                    ))}
                  </div>
                  <div
                    className="timeline-vertical"
                    style={{ minHeight: `${section.sectionHeightPx}px` }}
                  >
                    {section.items.map((session) => (
                      <button
                        type="button"
                        className={`timeline-block ${activeFile === session.name ? 'active' : ''}`}
                        style={{
                          top: `${session.topPct}%`,
                          height: `${session.heightPct}%`,
                          left: `${session.leftPct}%`,
                          width: `${session.widthPct}%`,
                        }}
                        onClick={() => onSelectFile(session.name)}
                        title={`${session.startLabel} - ${session.endLabel} | ${session.projectDir} | Part ${session.segmentIndex + 1}/${session.segmentCount}`}
                        key={`${session.name}-${session.segmentIndex}-${section.id}`}
                      >
                        <span className="timeline-block-title">
                          Conversation {session.conversationIndex} · Part {session.segmentIndex + 1}
                          /{session.segmentCount}
                        </span>
                        <span className="timeline-block-subtitle">
                          {session.startLabel} - {session.endLabel} ·{' '}
                          {getProjectDisplayName(session.projectDir)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="timeline-section-label">{section.rangeLabel}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  </section>
)
