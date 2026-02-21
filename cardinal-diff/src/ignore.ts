import fs from 'node:fs'
import path from 'node:path'
import { minimatch } from 'minimatch'
import { DEFAULT_IGNORE_PATTERNS } from './defaults'

const toPosixPath = (value: string): string => value.split(path.sep).join('/')
const globOptions = { dot: true, nocase: false }

export type GitIgnoreRule = {
  baseRelPath: string
  pattern: string
  negated: boolean
  anchored: boolean
  directoryOnly: boolean
  hasSlash: boolean
}

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
      minimatch(normalized, normalizedRule, globOptions) ||
      minimatch(pathWithSlash, normalizedRule, globOptions) ||
      minimatch(normalized, `**/${normalizedRule}`, globOptions)
    )
  })
}

const parseGitIgnoreRuleLine = (line: string, baseRelPath: string): GitIgnoreRule | null => {
  const normalizedLine = line.replace(/\r$/, '').trim()
  if (!normalizedLine) {
    return null
  }

  if (normalizedLine.startsWith('#') && !normalizedLine.startsWith('\\#')) {
    return null
  }

  let value = normalizedLine
  let negated = false

  if (value.startsWith('!') && !value.startsWith('\\!')) {
    negated = true
    value = value.slice(1)
  }

  if (value.startsWith('\\#') || value.startsWith('\\!')) {
    value = value.slice(1)
  }

  if (!value) {
    return null
  }

  const directoryOnly = value.endsWith('/')
  const trimmed = directoryOnly ? value.slice(0, -1) : value
  const normalized = toPosixPath(trimmed)
  const anchored = normalized.startsWith('/')
  const pattern = anchored ? normalized.slice(1) : normalized
  if (!pattern) {
    return null
  }

  return {
    baseRelPath,
    pattern,
    negated,
    anchored,
    directoryOnly,
    hasSlash: pattern.includes('/'),
  }
}

export const loadGitIgnoreRulesFromDirectory = (
  rootPath: string,
  relDirectoryPath: string,
): GitIgnoreRule[] => {
  const ignoreFilePath = path.join(rootPath, relDirectoryPath, '.gitignore')
  if (!fs.existsSync(ignoreFilePath)) {
    return []
  }

  return fs
    .readFileSync(ignoreFilePath, 'utf8')
    .split('\n')
    .map((line) => parseGitIgnoreRuleLine(line, toPosixPath(relDirectoryPath)))
    .filter((rule): rule is GitIgnoreRule => rule !== null)
}

const toPathFromRuleBase = (relPath: string, baseRelPath: string): string | null => {
  if (!baseRelPath) {
    return relPath
  }

  if (relPath === baseRelPath) {
    return ''
  }

  const prefix = `${baseRelPath}/`
  if (!relPath.startsWith(prefix)) {
    return null
  }

  return relPath.slice(prefix.length)
}

const matchesRulePath = (rule: GitIgnoreRule, relPathFromBase: string): boolean => {
  if (!relPathFromBase) {
    return false
  }

  if (rule.hasSlash) {
    const direct = minimatch(relPathFromBase, rule.pattern, globOptions)
    if (rule.anchored) {
      return direct
    }

    return direct || minimatch(relPathFromBase, `**/${rule.pattern}`, globOptions)
  }

  const segments = relPathFromBase.split('/').filter((item) => item.length > 0)
  return segments.some((segment) => minimatch(segment, rule.pattern, globOptions))
}

const matchesGitIgnoreRule = (
  rule: GitIgnoreRule,
  relPath: string,
  isDirectory: boolean,
): boolean => {
  const relPathFromBase = toPathFromRuleBase(relPath, rule.baseRelPath)
  if (relPathFromBase === null) {
    return false
  }

  if (!rule.directoryOnly) {
    return matchesRulePath(rule, relPathFromBase)
  }

  const segments = relPathFromBase.split('/').filter((item) => item.length > 0)
  const prefixCount = isDirectory ? segments.length : Math.max(0, segments.length - 1)
  for (let index = 1; index <= prefixCount; index += 1) {
    const prefix = segments.slice(0, index).join('/')
    if (matchesRulePath(rule, prefix)) {
      return true
    }
  }

  return false
}

export const isIgnoredByGitIgnoreRules = (
  relPath: string,
  isDirectory: boolean,
  rules: GitIgnoreRule[],
): boolean => {
  const normalized = toPosixPath(relPath)
  let ignored = false

  for (const rule of rules) {
    if (!matchesGitIgnoreRule(rule, normalized, isDirectory)) {
      continue
    }

    ignored = !rule.negated
  }

  return ignored
}
