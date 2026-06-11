import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getDaySessions } from '../services/session-service'

const createSessionFile = (filePath: string, cwd: string, timestamps: string[]): void => {
  const lines = [
    JSON.stringify({
      timestamp: timestamps[0] || new Date().toISOString(),
      type: 'session_meta',
      payload: { cwd },
    }),
    ...timestamps.map((timestamp, index) =>
      JSON.stringify({
        timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: [
            {
              type: index % 2 === 0 ? 'input_text' : 'output_text',
              text: `message-${index + 1}`,
            },
          ],
        },
      }),
    ),
  ]

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
}

describe('session-service day overlap selection', () => {
  // @spec SPEC-SERVER-SEGMENTS
  it('includes a conversation on every day where at least one segment overlaps', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-overlap-'))

    try {
      const day20 = path.join(root, '2026', '02', '20')
      const day21 = path.join(root, '2026', '02', '21')
      const day22 = path.join(root, '2026', '02', '22')
      fs.mkdirSync(day20, { recursive: true })
      fs.mkdirSync(day21, { recursive: true })
      fs.mkdirSync(day22, { recursive: true })

      createSessionFile(path.join(day20, 'chat-a.jsonl'), '/workspace/project-a', [
        '2026-02-20T23:50:00.000Z',
        '2026-02-21T00:10:00.000Z',
        '2026-02-22T00:05:00.000Z',
      ])

      const sessionsOn21 = getDaySessions(day21, 10, false, root)
      const sessionsOn22 = getDaySessions(day22, 10, false, root)

      expect(sessionsOn21).toHaveLength(1)
      expect(sessionsOn22).toHaveLength(1)
      expect(sessionsOn21[0]?.name).toBe('chat-a.jsonl')
      expect(sessionsOn21[0]?.relativePath).toBe('2026/02/20/chat-a.jsonl')
      expect(sessionsOn22[0]?.relativePath).toBe('2026/02/20/chat-a.jsonl')
      expect(sessionsOn21[0]?.startedAt).toBe('2026-02-21T00:10:00.000Z')
      expect(sessionsOn21[0]?.endedAt).toBe('2026-02-21T00:10:00.000Z')
      expect(sessionsOn22[0]?.startedAt).toBe('2026-02-22T00:05:00.000Z')
      expect(sessionsOn22[0]?.endedAt).toBe('2026-02-22T00:05:00.000Z')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not include a conversation on days where no segments overlap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-gap-'))

    try {
      const day20 = path.join(root, '2026', '02', '20')
      const day21 = path.join(root, '2026', '02', '21')
      fs.mkdirSync(day20, { recursive: true })
      fs.mkdirSync(day21, { recursive: true })

      createSessionFile(path.join(day20, 'chat-gap.jsonl'), '/workspace/project-b', [
        '2026-02-20T09:00:00.000Z',
        '2026-02-22T09:00:00.000Z',
      ])

      const sessionsOn21 = getDaySessions(day21, 10, false, root)
      expect(sessionsOn21).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
