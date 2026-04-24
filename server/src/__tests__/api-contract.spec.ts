import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createCardinalStore } from 'cardinal-store'

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-api-contract-'))
const dataRoot = path.join(rootDir, 'sessions')
const cacheDbPath = path.join(rootDir, 'cache', 'cardinal.sqlite')
const activityDataDir = path.join(rootDir, 'activity')
const outsideActivityFile = path.join(rootDir, 'outside.jpg')

process.env.DATA_ROOT = dataRoot
process.env.CACHE_DB_PATH = cacheDbPath
process.env.CARDINAL_ACTIVITY_DATA_DIR = activityDataDir
delete process.env.JIRA_BASE_URL
delete process.env.JIRA_AUTH_TOKEN
delete process.env.JIRA_EMAIL
delete process.env.JIRA_API_TOKEN

type TestApp = {
  server: Server
  baseUrl: string
}

const listen = async (): Promise<TestApp> => {
  const { createApp } = await import('../app')
  const server = createServer(createApp())

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api`,
  }
}

const getJson = async <T>(baseUrl: string, route: string): Promise<{ status: number; body: T }> => {
  const response = await fetch(`${baseUrl}${route}`)
  return {
    status: response.status,
    body: (await response.json()) as T,
  }
}

describe('server API contract', () => {
  let app: TestApp

  beforeAll(async () => {
    fs.mkdirSync(path.join(dataRoot, '2026', '02', '21'), { recursive: true })
    fs.mkdirSync(activityDataDir, { recursive: true })
    fs.writeFileSync(
      path.join(dataRoot, '2026', '02', '21', 'session.jsonl'),
      `${JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
        timestamp: '2026-02-21T10:00:00.000Z',
      })}\n`,
      'utf8',
    )
    fs.writeFileSync(outsideActivityFile, 'not-an-image', 'utf8')

    const store = createCardinalStore(cacheDbPath)
    store.upsertActivityScreenshotAsset({
      assetId: 'outside-asset',
      sha256: 'outside-asset',
      storagePath: outsideActivityFile,
      bytes: 12,
      width: null,
      height: null,
      createdAt: '2026-02-21T10:00:00.000Z',
    })

    app = await listen()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      app.server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('exposes root metadata and session date hierarchy', async () => {
    const root = await getJson<{ root: string; conversation_break_limit: number }>(
      app.baseUrl,
      '/root',
    )
    expect(root.status).toBe(200)
    expect(root.body.root).toBe(dataRoot)
    expect(root.body.conversation_break_limit).toBe(10)

    const years = await getJson<{ years: string[] }>(app.baseUrl, '/years')
    expect(years.status).toBe(200)
    expect(years.body.years).toEqual(['2026'])

    const months = await getJson<{ months: string[] }>(app.baseUrl, '/months?year=2026')
    expect(months.status).toBe(200)
    expect(months.body.months).toEqual(['02'])

    const days = await getJson<{ days: string[] }>(app.baseUrl, '/days?year=2026&month=02')
    expect(days.status).toBe(200)
    expect(days.body.days).toEqual(['21'])
  })

  it('blocks session file traversal and missing file requests with explicit status codes', async () => {
    const traversal = await getJson<{ error: string }>(
      app.baseUrl,
      '/file?relative_path=../../etc/passwd',
    )
    expect(traversal.status).toBe(403)
    expect(traversal.body.error).toBe('Path traversal is not allowed')

    const missing = await getJson<{ error: string }>(
      app.baseUrl,
      '/file?relative_path=2026/02/21/missing.jsonl',
    )
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('File not found')
  })

  it('validates activity ranges and refuses screenshots outside the activity root', async () => {
    const invalidRange = await getJson<{ error: string }>(
      app.baseUrl,
      '/activity/window-events?from=nope&to=2026-02-21T10:00:00.000Z',
    )
    expect(invalidRange.status).toBe(400)
    expect(invalidRange.body.error).toBe('from and to must be valid ISO timestamps')

    const screenshot = await getJson<{ error: string }>(
      app.baseUrl,
      '/activity/screenshots/outside-asset',
    )
    expect(screenshot.status).toBe(404)
    expect(screenshot.body.error).toBe('Screenshot not found')
  })

  it('returns explicit integration and mutation validation errors', async () => {
    const jira = await getJson<{ error: string }>(app.baseUrl, '/jira/projects')
    expect(jira.status).toBe(503)
    expect(jira.body.error).toContain('Jira integration is not configured')

    const cardinal = await fetch(`${app.baseUrl}/cardinal/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath: '/tmp' }),
    })
    const cardinalBody = (await cardinal.json()) as { error: string }
    expect(cardinal.status).toBe(400)
    expect(cardinalBody.error).toContain('Project path must be inside')
  })
})
