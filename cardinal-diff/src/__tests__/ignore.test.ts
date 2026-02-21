import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_IGNORE_PATTERNS } from '../defaults'
import { isIgnoredPath, loadProjectIgnoreRules } from '../ignore'

describe('ignore rules', () => {
  it('returns defaults when project ignore file is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-ignore-'))

    try {
      const rules = loadProjectIgnoreRules(root)
      expect(rules).toEqual(DEFAULT_IGNORE_PATTERNS)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('loads custom rules while preserving defaults', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-ignore-'))

    try {
      fs.writeFileSync(
        path.join(root, '.cardinaldiffignore'),
        '# comment\nbuild/\ncoverage/**\n\n*.cache\n',
        'utf8',
      )
      const rules = loadProjectIgnoreRules(root)
      expect(rules).toContain('build/')
      expect(rules).toContain('coverage/**')
      expect(rules).toContain('*.cache')
      expect(rules).toContain('.git/**')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('matches directory, glob, and nested file patterns', () => {
    const rules = ['build/', '*.log', 'coverage/**']

    expect(isIgnoredPath('build', true, rules)).toBe(true)
    expect(isIgnoredPath('logs/app.log', false, rules)).toBe(true)
    expect(isIgnoredPath('coverage/unit/output.json', false, rules)).toBe(true)
    expect(isIgnoredPath('src/index.ts', false, rules)).toBe(false)
  })
})
