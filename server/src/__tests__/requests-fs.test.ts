import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dataRoot } from '../config'
import { readDir, resolveSafePath, toPosixPath } from '../utils/fs-paths'
import { getConversationBreakLimitMinutes, isForceRefresh } from '../utils/requests'

describe('server request/path utilities', () => {
  it('parses break-limit query values with fallback behavior', () => {
    expect(getConversationBreakLimitMinutes('25')).toBe(25)
    expect(getConversationBreakLimitMinutes(5)).toBe(5)
    expect(getConversationBreakLimitMinutes('0')).toBeGreaterThan(0)
    expect(getConversationBreakLimitMinutes('not-a-number')).toBeGreaterThan(0)
  })

  it('parses force-refresh query values', () => {
    expect(isForceRefresh('1')).toBe(true)
    expect(isForceRefresh('true')).toBe(true)
    expect(isForceRefresh('yes')).toBe(true)
    expect(isForceRefresh('false')).toBe(false)
    expect(isForceRefresh(null)).toBe(false)
  })

  it('resolves safe paths and blocks traversal attempts', () => {
    const safe = resolveSafePath('2026/02/20')
    expect(safe.startsWith(dataRoot)).toBe(true)

    expect(() => resolveSafePath('../outside-root')).toThrow('Path traversal is not allowed')
  })

  it('reads directories while filtering dotfiles and normalizing separators', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-read-dir-'))

    try {
      fs.mkdirSync(path.join(tempDir, 'folder'))
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'ok', 'utf8')
      fs.writeFileSync(path.join(tempDir, '.hidden'), 'skip', 'utf8')

      const entries = readDir(tempDir)
      const names = entries.map((entry) => entry.name).sort()
      expect(names).toEqual(['file.txt', 'folder'])
      expect(toPosixPath(path.join('a', 'b', 'c'))).toBe('a/b/c')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns an empty listing when directory access fails', () => {
    const missingPath = path.join(os.tmpdir(), `server-missing-${Date.now()}`)
    expect(readDir(missingPath)).toEqual([])
  })
})
