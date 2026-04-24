import fs from 'node:fs'
import path from 'node:path'
import { toPosixPath } from './utils/path'

const specIdPattern = /\bSPEC-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g
const testDirectories = [
  'server/src/__tests__',
  'client/src/__tests__',
  'cardinal-diff/src/__tests__',
  'cardinal-store/src/__tests__',
  'cardinal-activity/src/__tests__',
  'scripts/__tests__',
]
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'coverage', '.coverage'])

type SpecReferenceInput = {
  specFiles: Map<string, string[]>
  testFiles: Map<string, string[]>
}

const uniqueSorted = (values: Iterable<string>): string[] => Array.from(new Set(values)).sort()

export const extractSpecIds = (content: string): string[] =>
  uniqueSorted(content.match(specIdPattern) || [])

export const extractTestSpecIds = (content: string): string[] =>
  uniqueSorted(
    Array.from(content.matchAll(/@spec\s+(SPEC-[A-Z0-9]+(?:-[A-Z0-9]+)*)/g), (match) => match[1]),
  )

export const evaluateSpecReferences = ({ specFiles, testFiles }: SpecReferenceInput): string[] => {
  const failures: string[] = []
  const specIdToFiles = new Map<string, string[]>()
  const testIds = new Set<string>()

  for (const [filePath, ids] of specFiles) {
    for (const id of ids) {
      specIdToFiles.set(id, [...(specIdToFiles.get(id) || []), filePath])
    }
  }

  for (const ids of testFiles.values()) {
    for (const id of ids) {
      testIds.add(id)
    }
  }

  for (const [id, files] of [...specIdToFiles.entries()].sort()) {
    const uniqueFiles = uniqueSorted(files)
    if (uniqueFiles.length > 1) {
      failures.push(`${id} appears in multiple spec docs: ${uniqueFiles.join(', ')}`)
    }
  }

  const documentedIds = new Set(specIdToFiles.keys())
  for (const id of uniqueSorted(testIds)) {
    if (!documentedIds.has(id)) {
      failures.push(`${id} is referenced by tests but is not documented in docs/specs`)
    }
  }

  for (const id of uniqueSorted(documentedIds)) {
    if (!testIds.has(id)) {
      failures.push(`${id} is documented but has no @spec test reference`)
    }
  }

  return failures
}

const collectFiles = (
  repoRoot: string,
  relativeDirectory: string,
  predicate: (filePath: string) => boolean,
): string[] => {
  const root = path.join(repoRoot, relativeDirectory)
  if (!fs.existsSync(root)) {
    return []
  }

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

      if (predicate(entryPath)) {
        files.push(entryPath)
      }
    }
  }

  visit(root)
  return files
}

const readIdMap = (
  repoRoot: string,
  files: string[],
  extractor: (content: string) => string[],
): Map<string, string[]> => {
  const idMap = new Map<string, string[]>()
  for (const filePath of files) {
    const relativePath = toPosixPath(path.relative(repoRoot, filePath))
    const ids = extractor(fs.readFileSync(filePath, 'utf8'))
    if (ids.length > 0) {
      idMap.set(relativePath, ids)
    }
  }
  return idMap
}

export const runSpecEnforcement = (repoRoot: string = process.cwd()): number => {
  const specFiles = collectFiles(repoRoot, 'docs/specs', (filePath) =>
    path.basename(filePath).endsWith('.spec.md'),
  )
  const testFiles = testDirectories.flatMap((directory) =>
    collectFiles(repoRoot, directory, (filePath) => /\.(test|spec)\.tsx?$/.test(filePath)),
  )

  const failures = evaluateSpecReferences({
    specFiles: readIdMap(repoRoot, specFiles, extractSpecIds),
    testFiles: readIdMap(repoRoot, testFiles, extractTestSpecIds),
  })

  if (failures.length > 0) {
    console.error('Spec enforcement failures:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    return 1
  }

  console.log('Spec enforcement check passed.')
  return 0
}

if (import.meta.main) {
  process.exit(runSpecEnforcement())
}
