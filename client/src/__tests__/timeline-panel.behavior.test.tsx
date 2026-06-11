import { beforeEach, describe, expect, it } from 'bun:test'
import { TimelinePanel } from '../components/TimelinePanel'
import type { TimelineModel } from '../types'
import { render, setupDom } from './render'

const timelineModel: TimelineModel = {
  hasData: true,
  rangeStartMs: Date.parse('2026-02-21T10:00:00.000Z'),
  rangeEndMs: Date.parse('2026-02-21T11:00:00.000Z'),
  gaps: [
    {
      id: 'gap-1',
      durationMs: 3_600_000,
      durationLabel: '1h',
      fromLabel: '10:15',
      toLabel: '11:15',
    },
  ],
  sections: [
    {
      id: 'section-1',
      sectionHeightPx: 240,
      rangeLabel: '10:00 - 10:15',
      laneCount: 1,
      ticks: [{ key: 'tick-1', label: '10:00', topPct: 0 }],
      items: [
        {
          name: 'chat-a.jsonl',
          relativePath: '2026/02/21/chat-a.jsonl',
          projectDir: '/workspace/code/cardinal-tt',
          fileIndex: 0,
          conversationIndex: 1,
          segmentIndex: 0,
          segmentCount: 2,
          startMs: Date.parse('2026-02-21T10:00:00.000Z'),
          endMs: Date.parse('2026-02-21T10:15:00.000Z'),
          topPct: 0,
          heightPct: 20,
          startLabel: '10:00',
          endLabel: '10:15',
          laneIndex: 0,
          leftPct: 0,
          widthPct: 100,
        },
      ],
    },
    {
      id: 'section-2',
      sectionHeightPx: 240,
      rangeLabel: '11:15 - 11:30',
      laneCount: 1,
      ticks: [],
      items: [],
    },
  ],
}

describe('timeline panel behavior', () => {
  beforeEach(() => {
    setupDom()
  })

  // @spec SPEC-CLIENT-TIMELINE
  it('renders timeline blocks and selects the clicked conversation file', async () => {
    const selectedFiles: string[] = []
    const view = await render(
      <TimelinePanel
        day="21"
        timelineModel={timelineModel}
        activeFile=""
        onSelectFile={(relativePath) => selectedFiles.push(relativePath)}
      />,
    )

    try {
      expect(view.container.textContent).toContain('Range:')
      expect(view.container.textContent).toContain('Compressed idle gap: 1h')

      const block = view.container.querySelector('.timeline-block')
      expect(block).toBeTruthy()
      await view.click(block as Element)

      expect(selectedFiles).toEqual(['2026/02/21/chat-a.jsonl'])
    } finally {
      await view.unmount()
    }
  })
})
