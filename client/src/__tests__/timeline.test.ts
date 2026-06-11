import { describe, expect, it } from 'bun:test'
import type { SessionFile } from '../types'
import { buildCompressedTimeline } from '../utils/timeline'

const makeSession = (
  name: string,
  projectDir: string,
  startedAt: string,
  endedAt: string,
  segments?: Array<{ startedAt?: string; endedAt?: string }>,
): SessionFile => ({
  name,
  relativePath: `2026/02/20/${name}.jsonl`,
  projectDir,
  startedAt,
  endedAt,
  segments,
  sizeBytes: 1,
  modifiedAt: endedAt,
})

describe('client timeline builder', () => {
  // @spec SPEC-CLIENT-TIMELINE
  it('returns an empty model when there are no sessions', () => {
    const model = buildCompressedTimeline([], '2026', '02', '20', 10)
    expect(model.hasData).toBe(false)
    expect(model.sections).toEqual([])
    expect(model.rangeStartMs).not.toBeNull()
  })

  it('creates overlap lanes and splits idle gaps into separate sections', () => {
    const files: SessionFile[] = [
      makeSession('a', '/workspace/a', '2026-02-20T08:00:00.000Z', '2026-02-20T08:20:00.000Z'),
      makeSession('b', '/workspace/b', '2026-02-20T08:05:00.000Z', '2026-02-20T08:25:00.000Z'),
      makeSession('c', '/workspace/c', '2026-02-20T12:00:00.000Z', '2026-02-20T12:05:00.000Z'),
    ]

    const model = buildCompressedTimeline(files, '2026', '02', '20', 10)
    expect(model.hasData).toBe(true)
    expect(model.sections.length).toBe(2)
    expect(model.gaps.length).toBe(1)
    expect(model.sections[0]?.laneCount).toBeGreaterThan(1)
  })

  it('supports multi-part segments and cross-day timeline ranges', () => {
    const files: SessionFile[] = [
      makeSession(
        'session-1',
        '/workspace/proj',
        '2026-02-20T23:55:00.000Z',
        '2026-02-21T00:20:00.000Z',
        [
          { startedAt: '2026-02-20T23:55:00.000Z', endedAt: '2026-02-21T00:05:00.000Z' },
          { startedAt: '2026-02-21T00:10:00.000Z', endedAt: '2026-02-21T00:20:00.000Z' },
        ],
      ),
    ]

    const model = buildCompressedTimeline(files, '2026', '02', '20', 10)
    expect(model.hasData).toBe(true)
    expect((model.rangeEndMs || 0) - (model.rangeStartMs || 0)).toBeGreaterThan(0)
    expect(model.sections[0]?.items).toHaveLength(2)
  })
})
