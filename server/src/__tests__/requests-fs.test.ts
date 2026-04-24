import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dataRoot } from '../config'
import { readDir, resolveSafePath, toPosixPath } from '../utils/fs-paths'
import { asArray, asBoolean, asNumber, asObject, asString, parseJsonRecord } from '../utils/json'
import { getConversationBreakLimitMinutes, isForceRefresh } from '../utils/requests'
import {
  failValidation,
  HttpValidationError,
  readBoundedInteger,
  readOptionalInteger,
  readOptionalString,
  readRequiredInteger,
  readRequiredIsoRange,
  readRequiredString,
  readRequiredStrings,
} from '../utils/validation'

describe('server request/path utilities', () => {
  // @spec SPEC-SERVER-RUNTIME-VALIDATION
  // @spec SPEC-SERVER-SAFE-PATHS
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

  it('reads trimmed runtime strings with alias fallback', () => {
    expect(
      readRequiredString({ projectKey: '  ENG ' }, ['project_key', 'projectKey'], 'missing'),
    ).toBe('ENG')
    expect(readOptionalString({ project_key: [' OPS '] }, 'project_key')).toBe('OPS')
    expect(readOptionalString({}, 'project_key', 'ALL')).toBe('ALL')
  })

  it('throws typed 400 validation errors for missing required input', () => {
    expect(() => readRequiredString({}, 'project_key', 'project_key is required')).toThrow(
      HttpValidationError,
    )

    try {
      failValidation('project_key is required')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpValidationError)
      expect((error as HttpValidationError).status).toBe(400)
      expect((error as HttpValidationError).message).toBe('project_key is required')
    }
  })

  it('reads grouped required strings from multiple body field spellings', () => {
    const fields = readRequiredStrings(
      { project_key: 'OPS', title: ' Add validation ', description: 'Ship it' },
      {
        projectKey: ['projectKey', 'project_key'],
        title: 'title',
        description: 'description',
      },
      'projectKey, title and description are required',
    )

    expect(fields).toEqual({
      projectKey: 'OPS',
      title: 'Add validation',
      description: 'Ship it',
    })
  })

  it('parses bounded and required integers', () => {
    expect(readBoundedInteger('20000', 100, 1, 1000)).toBe(1000)
    expect(readBoundedInteger('0', 100, 1, 1000)).toBe(1)
    expect(readBoundedInteger('nope', 100, 1, 1000)).toBe(100)
    expect(readOptionalInteger({ since_ns: '42' }, 'since_ns')).toBe(42)
    expect(readOptionalInteger({ since_ns: 'nope' }, 'since_ns')).toBeUndefined()
    expect(readRequiredInteger({ since_ns: '42' }, 'since_ns', 'since_ns is required')).toBe(42)
    expect(() => readRequiredInteger({}, 'since_ns', 'since_ns is required')).toThrow(
      'since_ns is required',
    )
  })

  it('parses and normalizes required ISO ranges', () => {
    expect(
      readRequiredIsoRange(
        { from: '2026-02-21T11:00:00.000Z', to: '2026-02-21T10:00:00.000Z' },
        'from',
        'to',
        'from and to must be valid ISO timestamps',
      ),
    ).toEqual({
      fromIso: '2026-02-21T10:00:00.000Z',
      toIso: '2026-02-21T11:00:00.000Z',
    })

    expect(() =>
      readRequiredIsoRange({ from: 'nope', to: '2026-02-21T10:00:00.000Z' }, 'from', 'to', 'bad'),
    ).toThrow('bad')
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

  it('centralizes JSON coercion helpers', () => {
    const parsed = parseJsonRecord('{"name":"demo","count":2,"enabled":true,"items":[1]}')

    expect(asObject(parsed)).toEqual(parsed)
    expect(asString(parsed?.name)).toBe('demo')
    expect(asNumber(parsed?.count)).toBe(2)
    expect(asBoolean(parsed?.enabled)).toBe(true)
    expect(asArray(parsed?.items)).toEqual([1])
    expect(parseJsonRecord('nope')).toBeNull()
  })
})
