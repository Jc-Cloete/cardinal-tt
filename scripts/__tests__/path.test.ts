import { describe, expect, it } from 'bun:test'
import path from 'node:path'
import { toPosixPath } from '../utils/path'

describe('script path utilities', () => {
  it('normalizes platform paths to POSIX separators', () => {
    expect(toPosixPath(path.join('docs', 'specs', 'server.spec.md'))).toBe(
      'docs/specs/server.spec.md',
    )
  })
})
