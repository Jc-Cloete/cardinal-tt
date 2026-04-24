import { spawnSync } from 'node:child_process'
import path from 'node:path'

type CoverageSummary = {
  functions: number
  lines: number
}

type CoverageThreshold = CoverageSummary

type WorkspaceCoverageConfig = {
  name: string
  directory: string
  patterns?: string[]
  threshold: CoverageThreshold
}

const workspaces: WorkspaceCoverageConfig[] = [
  {
    name: 'server',
    directory: 'server',
    patterns: [
      './src/__tests__/filters.test.ts',
      './src/__tests__/requests-fs.test.ts',
      './src/__tests__/session-parser.test.ts',
      './src/__tests__/session-service.test.ts',
    ],
    threshold: { functions: 85, lines: 85 },
  },
  { name: 'client', directory: 'client', threshold: { functions: 90, lines: 90 } },
  { name: 'cardinal-diff', directory: 'cardinal-diff', threshold: { functions: 70, lines: 70 } },
  { name: 'cardinal-store', directory: 'cardinal-store', threshold: { functions: 90, lines: 90 } },
  {
    name: 'cardinal-activity',
    directory: 'cardinal-activity',
    threshold: { functions: 20, lines: 40 },
  },
]

export const parseCoverageSummary = (output: string): CoverageSummary => {
  const allFilesLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('All files'))

  if (!allFilesLine) {
    throw new Error('Could not find "All files" coverage summary row')
  }

  const parts = allFilesLine.split('|').map((part) => part.trim())
  const functions = Number(parts[1])
  const lines = Number(parts[2])

  if (!Number.isFinite(functions) || !Number.isFinite(lines)) {
    throw new Error(`Could not parse coverage summary row: ${allFilesLine}`)
  }

  return { functions, lines }
}

const formatPercent = (value: number): string => `${value.toFixed(2)}%`

export const evaluateCoverage = (
  workspaceName: string,
  summary: CoverageSummary,
  threshold: CoverageThreshold,
): string[] => {
  const failures: string[] = []

  if (summary.functions < threshold.functions) {
    failures.push(
      `${workspaceName} function coverage ${formatPercent(summary.functions)} is below threshold ${formatPercent(threshold.functions)}`,
    )
  }

  if (summary.lines < threshold.lines) {
    failures.push(
      `${workspaceName} line coverage ${formatPercent(summary.lines)} is below threshold ${formatPercent(threshold.lines)}`,
    )
  }

  return failures
}

const runWorkspaceCoverage = (
  repoRoot: string,
  config: WorkspaceCoverageConfig,
): { summary: CoverageSummary; output: string } => {
  const result = spawnSync(
    'bun',
    [
      'test',
      ...(config.patterns || []),
      '--coverage',
      '--coverage-reporter=text',
      '--coverage-dir',
      path.join(repoRoot, '.coverage', config.name),
    ],
    {
      cwd: path.join(repoRoot, config.directory),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    },
  )

  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0) {
    throw new Error(`Coverage command failed for ${config.name}\n${output}`)
  }

  return {
    summary: parseCoverageSummary(output),
    output,
  }
}

export const runCoverageGate = (repoRoot: string = process.cwd()): number => {
  const failures: string[] = []
  const rows: string[] = []

  for (const workspace of workspaces) {
    const { summary } = runWorkspaceCoverage(repoRoot, workspace)
    rows.push(
      `${workspace.name}: functions ${formatPercent(summary.functions)} / ${formatPercent(
        workspace.threshold.functions,
      )}, lines ${formatPercent(summary.lines)} / ${formatPercent(workspace.threshold.lines)}`,
    )
    failures.push(...evaluateCoverage(workspace.name, summary, workspace.threshold))
  }

  console.log('Coverage summary:')
  for (const row of rows) {
    console.log(`- ${row}`)
  }

  if (failures.length > 0) {
    console.error('\nCoverage threshold failures:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    return 1
  }

  return 0
}

if (import.meta.main) {
  process.exit(runCoverageGate())
}
