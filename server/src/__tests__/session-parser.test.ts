import { describe, expect, it } from 'bun:test'
import {
  buildConversationSegments,
  parseSessionFileContent,
  toSessionSummary,
} from '../domain/session-parser'
import type { ProcessedSession } from '../types'

describe('session-parser', () => {
  // @spec SPEC-SERVER-SEGMENTS
  it('parses timestamps, project cwd, and filtered content', () => {
    const content = [
      '{"timestamp":"2026-02-20T10:00:00.000Z","type":"session_meta","payload":{"cwd":"/workspace/app"}}',
      '{"timestamp":"2026-02-20T10:01:00.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
      'not-json',
      '{"timestamp":"2026-02-20T10:02:00.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi"}]}}',
    ].join('\n')

    const parsed = parseSessionFileContent(content)
    expect(parsed.projectDir).toBe('/workspace/app')
    expect(parsed.timestampsMs).toHaveLength(3)
    expect(parsed.filteredContent.includes('session_meta')).toBe(false)
    expect(parsed.filteredContent.includes('"role":"user"')).toBe(true)
    expect(parsed.filteredContent.includes('not-json')).toBe(true)
  })

  it('splits conversation segments on inactivity gaps', () => {
    const timestamps = [
      Date.parse('2026-02-20T10:00:00.000Z'),
      Date.parse('2026-02-20T10:04:00.000Z'),
      Date.parse('2026-02-20T10:30:00.000Z'),
    ]

    const segments = buildConversationSegments(timestamps, Date.now(), 10)
    expect(segments).toHaveLength(2)
    expect(segments[0]?.startedAt).toBe('2026-02-20T10:00:00.000Z')
    expect(segments[0]?.endedAt).toBe('2026-02-20T10:04:00.000Z')
    expect(segments[1]?.startedAt).toBe('2026-02-20T10:30:00.000Z')
  })

  it('uses fallback timestamp for empty timestamp files', () => {
    const fallback = Date.parse('2026-02-20T11:00:00.000Z')
    const segments = buildConversationSegments([], fallback, 10)
    expect(segments).toEqual([
      {
        startedAt: '2026-02-20T11:00:00.000Z',
        endedAt: '2026-02-20T11:00:00.000Z',
      },
    ])
  })

  it('builds summary boundaries from computed segments', () => {
    const session: ProcessedSession = {
      filePath: '/tmp/session.jsonl',
      dayKey: '2026/02/20',
      name: 'session.jsonl',
      fileHash: 'abc',
      sizeBytes: 10,
      modifiedAt: '2026-02-20T10:10:00.000Z',
      projectDir: '/workspace/app',
      timestampsMs: [
        Date.parse('2026-02-20T10:00:00.000Z'),
        Date.parse('2026-02-20T10:03:00.000Z'),
      ],
      filteredContent: 'x',
    }

    const summary = toSessionSummary(session, 10)
    expect(summary.startedAt).toBe('2026-02-20T10:00:00.000Z')
    expect(summary.endedAt).toBe('2026-02-20T10:03:00.000Z')
    expect(summary.projectDir).toBe('/workspace/app')
  })
})
