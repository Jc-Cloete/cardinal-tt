import {
  MIN_BLOCK_HEIGHT_PX,
  MIN_BLOCK_PERCENT,
  TIMELINE_IDLE_GAP_SPLIT_MINUTES,
  TIMELINE_MIN_SECTION_HEIGHT_PX,
  TIMELINE_PX_PER_HOUR,
  TIMELINE_SECTION_PADDING_MINUTES,
} from '../constants'
import type {
  RawTimelineItem,
  SessionFile,
  TimelineGap,
  TimelineItem,
  TimelineModel,
  TimelineSection,
  TimelineTick,
} from '../types'
import { formatDuration, formatTime, getDayBounds, parseTimeMs } from './date'

// Build a vertical timeline model with idle-gap compression + overlap lanes.
export const buildCompressedTimeline = (
  files: SessionFile[],
  year: string,
  month: string,
  day: string,
  conversationBreakLimit: number,
): TimelineModel => {
  const fallback = getDayBounds(year, month, day)
  const rawSegments: RawTimelineItem[] = files
    .flatMap((session, fileIndex) => {
      const segments =
        Array.isArray(session?.segments) && session.segments.length > 0
          ? session.segments
          : [{ startedAt: session?.startedAt, endedAt: session?.endedAt }]

      return segments.map((segment, segmentIndex) => {
        const fallbackMs = parseTimeMs(session?.modifiedAt)
        const startMs = parseTimeMs(segment?.startedAt || session?.startedAt, fallbackMs)
        const endMs = Math.max(
          parseTimeMs(segment?.endedAt || segment?.startedAt || session?.endedAt, startMs),
          startMs + 60_000,
        )

        return {
          name: session.name,
          relativePath: session.relativePath,
          projectDir: session.projectDir,
          fileIndex,
          conversationIndex: fileIndex + 1,
          segmentIndex,
          segmentCount: segments.length,
          startMs,
          endMs,
        }
      })
    })
    .sort((a, b) => a.startMs - b.startMs)

  if (rawSegments.length === 0) {
    return {
      hasData: false,
      rangeStartMs: fallback?.startMs ?? null,
      rangeEndMs: fallback?.endMs ?? null,
      sections: [],
      gaps: [],
    }
  }

  const rangeStartMs = Math.min(...rawSegments.map((item) => item.startMs))
  const rangeEndMs = Math.max(...rawSegments.map((item) => item.endMs))
  const isMultiDay = new Date(rangeStartMs).toDateString() !== new Date(rangeEndMs).toDateString()

  const splitGapMinutes = Math.max(
    TIMELINE_IDLE_GAP_SPLIT_MINUTES,
    Number.isFinite(conversationBreakLimit)
      ? conversationBreakLimit
      : TIMELINE_IDLE_GAP_SPLIT_MINUTES,
  )
  const splitGapMs = splitGapMinutes * 60_000
  const sectionPaddingMs = TIMELINE_SECTION_PADDING_MINUTES * 60_000
  const baseSections: Array<{ startMs: number; endMs: number; items: RawTimelineItem[] }> = []

  for (const segment of rawSegments) {
    const current = baseSections[baseSections.length - 1]

    if (!current) {
      baseSections.push({
        startMs: segment.startMs,
        endMs: segment.endMs,
        items: [segment],
      })
      continue
    }

    if (segment.startMs - current.endMs > splitGapMs) {
      baseSections.push({
        startMs: segment.startMs,
        endMs: segment.endMs,
        items: [segment],
      })
      continue
    }

    current.endMs = Math.max(current.endMs, segment.endMs)
    current.items.push(segment)
  }

  const gaps: TimelineGap[] = baseSections.slice(1).map((section, idx) => {
    const previous = baseSections[idx]
    const durationMs = Math.max(0, section.startMs - previous.endMs)

    return {
      id: `gap-${idx}`,
      durationMs,
      durationLabel: formatDuration(durationMs),
      fromLabel: formatTime(previous.endMs, isMultiDay),
      toLabel: formatTime(section.startMs, isMultiDay),
    }
  })

  const sections: TimelineSection[] = baseSections.map((section, index) => {
    const displayStartMs = section.startMs - sectionPaddingMs
    const displayEndMs = section.endMs + sectionPaddingMs
    const durationMs = Math.max(displayEndMs - displayStartMs, 30 * 60_000)
    const durationHours = durationMs / 3_600_000
    const sectionHeightPx = Math.max(
      TIMELINE_MIN_SECTION_HEIGHT_PX,
      Math.ceil(durationHours * TIMELINE_PX_PER_HOUR),
    )

    const tickStepMinutes = durationHours <= 6 ? 30 : durationHours <= 24 ? 60 : 120
    const tickStepMs = tickStepMinutes * 60_000
    const tickStartMs = Math.floor(displayStartMs / tickStepMs) * tickStepMs
    const ticks: TimelineTick[] = []

    for (let ms = tickStartMs; ms <= displayEndMs; ms += tickStepMs) {
      if (ms < displayStartMs) {
        continue
      }

      const dt = new Date(ms)
      const isMidnight = dt.getHours() === 0 && dt.getMinutes() === 0
      const label =
        isMultiDay && isMidnight
          ? dt.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
          : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const topPct = ((ms - displayStartMs) / durationMs) * 100

      ticks.push({
        key: `${index}-${ms}`,
        label,
        topPct: Math.min(Math.max(topPct, 0), 100),
      })
    }

    const rawItems = section.items.map((item) => {
      const clampedStart = Math.max(displayStartMs, Math.min(item.startMs, displayEndMs))
      const clampedEnd = Math.max(clampedStart + 60_000, Math.min(item.endMs, displayEndMs))
      const minHeightPct = Math.max(
        MIN_BLOCK_PERCENT,
        (MIN_BLOCK_HEIGHT_PX / sectionHeightPx) * 100,
      )

      let topPct = ((clampedStart - displayStartMs) / durationMs) * 100
      const maxTopPct = Math.max(0, 100 - minHeightPct)
      if (topPct > maxTopPct) {
        topPct = maxTopPct
      }

      const rawHeightPct = ((clampedEnd - clampedStart) / durationMs) * 100
      const maxAvailablePct = Math.max(100 - topPct, MIN_BLOCK_PERCENT)
      const heightPct = Math.min(Math.max(rawHeightPct, minHeightPct), maxAvailablePct)

      return {
        ...item,
        topPct,
        heightPct,
        startLabel: formatTime(item.startMs, isMultiDay),
        endLabel: formatTime(item.endMs, isMultiDay),
      }
    })

    const laneEndPct: number[] = []
    const preferredLaneByConversation = new Map<string, number>()
    const visualGapPct = 0.3
    // Stable lane preference keeps multi-part conversations visually aligned across a section.
    const laneAssigned = rawItems
      .sort((a, b) => a.topPct - b.topPct || a.heightPct - b.heightPct)
      .map((item) => {
        const visualStartPct = item.topPct
        const visualEndPct = Math.min(100, item.topPct + item.heightPct + visualGapPct)
        const preferredLane = preferredLaneByConversation.get(item.relativePath)

        const laneIsFree = (lane: number | undefined): boolean =>
          lane !== undefined &&
          lane >= 0 &&
          lane < laneEndPct.length &&
          typeof laneEndPct[lane] === 'number' &&
          laneEndPct[lane] <= visualStartPct

        let laneIndex = -1
        if (preferredLane !== undefined && laneIsFree(preferredLane)) {
          laneIndex = preferredLane
        }

        if (laneIndex === -1) {
          laneIndex = laneEndPct.findIndex((laneEnd) => laneEnd <= visualStartPct)
        }

        if (laneIndex === -1) {
          laneIndex = laneEndPct.length
        }

        laneEndPct[laneIndex] = visualEndPct
        preferredLaneByConversation.set(item.relativePath, laneIndex)

        return {
          ...item,
          laneIndex,
        }
      })

    const laneCount = Math.max(1, laneEndPct.length)
    const laneWidthPct = 100 / laneCount
    const laneGapPct = Math.min(1.2, laneWidthPct * 0.18)
    const items: TimelineItem[] = laneAssigned.map((item) => ({
      ...item,
      leftPct: item.laneIndex * laneWidthPct,
      widthPct: Math.max(laneWidthPct - laneGapPct, 2),
    }))

    return {
      id: `section-${index}`,
      sectionHeightPx,
      rangeLabel: `${formatTime(displayStartMs, isMultiDay)} to ${formatTime(displayEndMs, isMultiDay)}`,
      laneCount,
      ticks,
      items,
    }
  })

  return {
    hasData: true,
    rangeStartMs,
    rangeEndMs,
    sections,
    gaps,
  }
}
