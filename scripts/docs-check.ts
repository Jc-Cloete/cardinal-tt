import fs from 'node:fs'
import path from 'node:path'
import { toPosixPath } from './utils/path'

const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'coverage', '.coverage'])

export const requiredDocumentationPaths = [
  'README.md',
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/README.md',
  'docs/DESIGN.md',
  'docs/FRONTEND.md',
  'docs/PLANS.md',
  'docs/QUALITY_SCORE.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/index.md',
  'docs/product-specs/index.md',
  'docs/exec-plans/tech-debt-tracker.md',
]

type DocumentationEvaluationInput = {
  repoRoot?: string
  requiredPaths?: string[]
  markdownFiles?: string[]
}

type MarkdownLink = {
  line: number
  target: string
}

const isExternalLink = (target: string): boolean =>
  /^(?:https?:|mailto:|tel:)/i.test(target) || target.startsWith('#')

const cleanLocalTarget = (target: string): string => target.split('#', 1)[0].trim()

const lineNumberAt = (content: string, offset: number): number =>
  content.slice(0, offset).split('\n').length

export const extractLocalMarkdownLinks = (content: string): MarkdownLink[] => {
  const links: MarkdownLink[] = []
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

  for (const match of content.matchAll(pattern)) {
    const target = match[1]?.trim()
    if (!target || isExternalLink(target)) {
      continue
    }

    links.push({
      line: lineNumberAt(content, match.index || 0),
      target,
    })
  }

  return links
}

const collectMarkdownFiles = (directory: string): string[] => {
  const files: string[] = []

  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(entryPath)
        }
        continue
      }

      if (entry.name.endsWith('.md')) {
        files.push(entryPath)
      }
    }
  }

  visit(directory)
  return files
}

export const evaluateDocumentation = ({
  repoRoot = process.cwd(),
  requiredPaths = requiredDocumentationPaths,
  markdownFiles,
}: DocumentationEvaluationInput = {}): string[] => {
  const failures: string[] = []

  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(path.join(repoRoot, requiredPath))) {
      failures.push(`Missing required documentation path: ${requiredPath}`)
    }
  }

  const files = markdownFiles || collectMarkdownFiles(repoRoot)
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8')
    const relativeSource = toPosixPath(path.relative(repoRoot, filePath))

    for (const link of extractLocalMarkdownLinks(content)) {
      const target = cleanLocalTarget(link.target)
      if (!target) {
        continue
      }

      if (path.isAbsolute(target)) {
        failures.push(`${relativeSource}:${link.line} uses an absolute local link: ${link.target}`)
        continue
      }

      const resolved = path.resolve(path.dirname(filePath), decodeURIComponent(target))
      if (!resolved.startsWith(path.resolve(repoRoot))) {
        failures.push(`${relativeSource}:${link.line} links outside the repository: ${link.target}`)
        continue
      }

      if (!fs.existsSync(resolved)) {
        failures.push(`${relativeSource}:${link.line} has a broken local link: ${link.target}`)
      }
    }
  }

  return failures
}

export const runDocsCheck = (repoRoot: string = process.cwd()): number => {
  const failures = evaluateDocumentation({ repoRoot })

  if (failures.length > 0) {
    console.error('Documentation check failures:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    return 1
  }

  console.log('Documentation check passed.')
  return 0
}

if (import.meta.main) {
  process.exit(runDocsCheck())
}
