import { describe, expect, it } from 'bun:test'
import { readProjectDirFromSessionMeta, shouldExcludePreviewEntry } from '../domain/filters'
import type { JsonRecord } from '../types'

const toRecord = (value: Record<string, unknown>): JsonRecord => value as JsonRecord

describe('server filters', () => {
  it('extracts project cwd from session metadata', () => {
    const entry = toRecord({
      type: 'session_meta',
      payload: { cwd: '  /Users/example/project  ' },
    })

    expect(readProjectDirFromSessionMeta(entry)).toBe('/Users/example/project')
  })

  it('returns null for non-session_meta entries', () => {
    const entry = toRecord({
      type: 'response_item',
      payload: { cwd: '/Users/example/project' },
    })
    expect(readProjectDirFromSessionMeta(entry)).toBeNull()
  })

  it('filters internal event/message payloads and developer role entries', () => {
    expect(shouldExcludePreviewEntry(toRecord({ type: 'session_meta' }))).toBe(true)
    expect(shouldExcludePreviewEntry(toRecord({ type: 'event_msg' }))).toBe(true)
    expect(shouldExcludePreviewEntry(toRecord({ type: 'turn_context' }))).toBe(true)

    expect(
      shouldExcludePreviewEntry(
        toRecord({
          type: 'response_item',
          payload: { type: 'reasoning' },
        }),
      ),
    ).toBe(true)

    expect(
      shouldExcludePreviewEntry(
        toRecord({
          type: 'response_item',
          payload: { type: 'message', role: 'developer' },
        }),
      ),
    ).toBe(true)
  })

  it('filters entries that contain instruction/environment tag pairs and keeps normal messages', () => {
    expect(
      shouldExcludePreviewEntry(
        toRecord({
          type: 'response_item',
          payload: { type: 'message', text: '<INSTRUCTIONS>secret</INSTRUCTIONS>' },
        }),
      ),
    ).toBe(true)

    expect(
      shouldExcludePreviewEntry(
        toRecord({
          type: 'response_item',
          payload: { type: 'message', text: '<environment_context>x</environment_context>' },
        }),
      ),
    ).toBe(true)

    expect(
      shouldExcludePreviewEntry(
        toRecord({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello world' }],
          },
        }),
      ),
    ).toBe(false)
  })
})
