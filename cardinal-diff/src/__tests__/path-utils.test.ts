import { describe, expect, it } from 'bun:test'
import path from 'node:path'
import { toPosixPath } from '../path-utils'

describe('cardinal-diff path utilities', () => {
  it('normalizes platform paths to POSIX separators', () => {
    expect(toPosixPath(path.join('src', 'nested', 'file.ts'))).toBe('src/nested/file.ts')
  })
})
