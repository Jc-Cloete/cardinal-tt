import fs from 'node:fs'
import path from 'node:path'

type WorkspaceName =
  | 'client'
  | 'server'
  | 'cardinal-diff'
  | 'cardinal-activity'
  | 'cardinal-store'
  | 'cardinal-observability'

type ImportEvaluationInput = {
  importerWorkspace: WorkspaceName
  importerPath: string
  specifier: string
  repoRoot: string
}

const workspaceNames: WorkspaceName[] = [
  'client',
  'server',
  'cardinal-diff',
  'cardinal-activity',
  'cardinal-store',
  'cardinal-observability',
]

const allowedWorkspaceImports: Record<WorkspaceName, WorkspaceName[]> = {
  client: ['cardinal-observability'],
  server: ['cardinal-observability', 'cardinal-store'],
  'cardinal-diff': ['cardinal-observability', 'cardinal-store'],
  'cardinal-activity': ['cardinal-observability', 'cardinal-store'],
  'cardinal-store': ['cardinal-observability'],
  'cardinal-observability': [],
}

const sourceFileExtensions = new Set(['.ts', '.tsx'])
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'coverage', '.coverage'])

const toPosixPath = (value: string): string => value.split(path.sep).join('/')

const findWorkspaceForPath = (repoRoot: string, filePath: string): WorkspaceName | null => {
  const relative = toPosixPath(path.relative(repoRoot, filePath))
  return (
    workspaceNames.find(
      (workspace) => relative === workspace || relative.startsWith(`${workspace}/`),
    ) || null
  )
}

const getWorkspacePackageSpecifier = (specifier: string): WorkspaceName | null =>
  workspaceNames.find(
    (workspace) => specifier === workspace || specifier.startsWith(`${workspace}/`),
  ) || null

const formatAllowed = (workspace: WorkspaceName): string => {
  const allowed = allowedWorkspaceImports[workspace]
  return allowed.length > 0 ? allowed.join(', ') : '(none)'
}

export const evaluateImport = ({
  importerWorkspace,
  importerPath,
  specifier,
  repoRoot,
}: ImportEvaluationInput): string | null => {
  const workspacePackage = getWorkspacePackageSpecifier(specifier)
  if (workspacePackage) {
    if (
      workspacePackage === importerWorkspace ||
      allowedWorkspaceImports[importerWorkspace].includes(workspacePackage)
    ) {
      return null
    }

    return `${importerWorkspace} may not import ${workspacePackage} from ${importerPath}; allowed local packages: ${formatAllowed(importerWorkspace)}`
  }

  if (!specifier.startsWith('.')) {
    return null
  }

  const resolved = path.resolve(path.dirname(importerPath), specifier)
  const resolvedWorkspace = findWorkspaceForPath(repoRoot, resolved)
  if (!resolvedWorkspace || resolvedWorkspace === importerWorkspace) {
    return null
  }

  return `${importerWorkspace} may not import ${resolvedWorkspace} via ${specifier} from ${importerPath}`
}

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = []

  const visit = (current: string): void => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(entryPath)
        }
        continue
      }

      if (sourceFileExtensions.has(path.extname(entry.name))) {
        files.push(entryPath)
      }
    }
  }

  visit(directory)
  return files
}

const extractImportSpecifiers = (source: string): string[] => {
  const specifiers: string[] = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier) {
        specifiers.push(specifier)
      }
    }
  }

  return specifiers
}

export const runArchitectureCheck = (repoRoot: string = process.cwd()): number => {
  const violations: string[] = []

  for (const workspace of workspaceNames) {
    const workspaceRoot = path.join(repoRoot, workspace)
    if (!fs.existsSync(workspaceRoot)) {
      continue
    }

    for (const filePath of collectSourceFiles(workspaceRoot)) {
      const source = fs.readFileSync(filePath, 'utf8')
      for (const specifier of extractImportSpecifiers(source)) {
        const violation = evaluateImport({
          importerWorkspace: workspace,
          importerPath: filePath,
          specifier,
          repoRoot,
        })
        if (violation) {
          violations.push(violation)
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('Architecture boundary violations:')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    return 1
  }

  console.log('Architecture boundary check passed.')
  return 0
}

if (import.meta.main) {
  process.exit(runArchitectureCheck())
}
