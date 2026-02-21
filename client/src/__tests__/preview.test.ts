import { describe, expect, it } from 'bun:test'
import { parsePreviewMessages } from '../utils/preview'

describe('client preview parser', () => {
  it('parses valid response-item messages and extracts text/image blocks', () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }, { type: 'input_image' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-02-20T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'commentary',
          content: [{ type: 'output_text', text: 'world' }],
        },
      }),
    ].join('\n')

    const messages = parsePreviewMessages(lines)
    expect(messages).toHaveLength(2)
    expect(messages[0]?.text).toContain('hello')
    expect(messages[0]?.text).toContain('[image]')
    expect(messages[1]?.phase).toBe('commentary')
  })

  it('ignores invalid json and non-message response items', () => {
    const lines = [
      'not-json',
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call' } }),
    ].join('\n')
    expect(parsePreviewMessages(lines)).toEqual([])
  })

  it('applies default role/phase values and computes line counts', () => {
    const line = JSON.stringify({
      timestamp: '2026-02-20T10:02:00.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        content: [{ type: 'text', text: 'line 1\nline 2' }],
      },
    })

    const [message] = parsePreviewMessages(line)
    expect(message?.role).toBe('unlabeled')
    expect(message?.phase).toBe('')
    expect(message?.lineCount).toBe(2)
  })
})
