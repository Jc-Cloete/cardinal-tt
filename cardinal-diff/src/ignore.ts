import fs from 'node:fs'
import path from 'node:path'
import { minimatch } from 'minimatch'
import { DEFAULT_IGNORE_PATTERNS } from './defaults'

const toPosixPath = (value: string): string => value.split(path.sep).join('/')

export const loadProjectIgnoreRules = (rootPath: string): string[] => {
  // Project-local rules extend defaults; defaults always remain active for safety/performance.
  const ignoreFile = path.join(rootPath, '.cardinaldiffignore')
  if (!fs.existsSync(ignoreFile)) {
    return [...DEFAULT_IGNORE_PATTERNS]
  }

  const customRules = fs
    .readFileSync(ignoreFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  return [...DEFAULT_IGNORE_PATTERNS, ...customRules]
}

export const isIgnoredPath = (relPath: string, isDirectory: boolean, rules: string[]): boolean => {
  const normalized = toPosixPath(relPath)
  const pathWithSlash = isDirectory ? `${normalized}/` : normalized

  return rules.some((rule) => {
    const normalizedRule = rule.trim()
    if (!normalizedRule) {
      return false
    }

    if (normalizedRule.endsWith('/')) {
      const dirRule = normalizedRule.slice(0, -1)
      return normalized === dirRule || pathWithSlash.startsWith(`${dirRule}/`)
    }

    return (
      minimatch(normalized, normalizedRule, { dot: true, nocase: false }) ||
      minimatch(pathWithSlash, normalizedRule, { dot: true, nocase: false }) ||
      minimatch(normalized, `**/${normalizedRule}`, { dot: true, nocase: false })
    )
  })
}
