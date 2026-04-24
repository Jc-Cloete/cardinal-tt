import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_IGNORE_PATTERNS } from '../defaults'
import {
  isIgnoredByGitIgnoreRules,
  isIgnoredPath,
  loadGitIgnoreRulesFromDirectory,
  loadProjectIgnoreRules,
} from '../ignore'

describe('ignore rules', () => {
  // @spec SPEC-DIFF-IGNORE
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

  it('loads and evaluates .gitignore rules including negation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-ignore-'))

    try {
      fs.writeFileSync(path.join(root, '.gitignore'), '*.log\ndist/\n', 'utf8')
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(path.join(root, 'src', '.gitignore'), '*.tmp\n!keep.tmp\n', 'utf8')

      const rootRules = loadGitIgnoreRulesFromDirectory(root, '')
      const srcRules = loadGitIgnoreRulesFromDirectory(root, 'src')
      const allRules = [...rootRules, ...srcRules]

      expect(isIgnoredByGitIgnoreRules('debug.log', false, allRules)).toBe(true)
      expect(isIgnoredByGitIgnoreRules('dist/app.js', false, allRules)).toBe(true)
      expect(isIgnoredByGitIgnoreRules('src/file.tmp', false, allRules)).toBe(true)
      expect(isIgnoredByGitIgnoreRules('src/keep.tmp', false, allRules)).toBe(false)
      expect(isIgnoredByGitIgnoreRules('src/index.ts', false, allRules)).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
