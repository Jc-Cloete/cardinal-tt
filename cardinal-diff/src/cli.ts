import { installLaunchAgent, runAgent, uninstallLaunchAgent } from './agent'
import { buildRangeDiffEntries } from './diff'
import { diffLogger } from './observability'
import {
  addProjectService,
  getCommitDetailsService,
  getFileHistoryService,
  getProjectService,
  listCommitRangeEntriesService,
  listCommitsService,
  listProjectsService,
  removeProjectService,
  reprocessProjectService,
  runDoctorService,
} from './service'
import type { HashPolicy, JsonValue, ProjectMode } from './types'

const cliLogger = diffLogger.child({ component: 'cli' })

// CLI output is always JSON to keep tooling integrations stable.
const printJson = (value: JsonValue): void => {
  cliLogger.log({
    event: 'cardinal.diff.cli.output.json',
    level: 'debug',
    fields: {
      top_level_type: Array.isArray(value) ? 'array' : typeof value,
    },
  })
  console.log(JSON.stringify(value, null, 2))
}

const readOption = (args: string[], key: string): string | undefined => {
  const index = args.indexOf(key)
  if (index < 0 || index + 1 >= args.length) {
    return undefined
  }

  return args[index + 1]
}

const hasFlag = (args: string[], key: string): boolean => args.includes(key)

const readIntOption = (args: string[], key: string): number | undefined => {
  const value = readOption(args, key)
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseTimeToNs = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined
  }

  if (/^\d+$/.test(value)) {
    const numeric = Number.parseInt(value, 10)
    if (!Number.isFinite(numeric)) {
      return undefined
    }
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1_000_000
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return parsed * 1_000_000
}

const usage = (): void => {
  cliLogger.log({
    event: 'cardinal.diff.cli.usage.print',
    level: 'warn',
    fields: {},
  })
  console.log(
    `
cardinaldiff commands:
  projects list
  projects add --path <dir> [--name <name>] [--mode metadata|content] [--hash-policy off|on_change]
  projects remove <project_id>
  projects reprocess <project_id> [--allow-active-agent]
  commits list --project <id> [--since <iso|ms|ns>] [--until <iso|ms|ns>] [--since_ns <ns>] [--until_ns <ns>] [--limit N]
  commit show <commit_id>
  file history --project <id> --path <rel_path> [--limit N]
  diff --project <id> --from <commit_id> --to <commit_id> [--path <rel_path>]
  doctor --project <id> [--repair]
  agent run
  agent install
  agent uninstall
`.trim(),
  )
}

const runProjects = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.projects.command',
    fields: {
      args: args.join(' '),
    },
  })
  const action = args[0]
  if (action === 'list') {
    printJson({ projects: listProjectsService() })
    return
  }

  if (action === 'add') {
    const rootPath = readOption(args, '--path')
    if (!rootPath) {
      throw new Error('Missing required --path')
    }

    const modeRaw = readOption(args, '--mode')
    const mode: ProjectMode = modeRaw === 'content' ? 'content' : 'metadata'

    const hashPolicyRaw = readOption(args, '--hash-policy')
    const hashPolicy: HashPolicy = hashPolicyRaw === 'on_change' ? 'on_change' : 'off'
    const name = readOption(args, '--name')
    const project = addProjectService({ rootPath, name, mode, hashPolicy })
    printJson({ project })
    return
  }

  if (action === 'remove') {
    const projectId = args[1]
    if (!projectId) {
      throw new Error('Missing project_id')
    }

    removeProjectService(projectId)
    printJson({ ok: true, projectId })
    return
  }

  if (action === 'reprocess') {
    const projectId = args[1]
    if (!projectId) {
      throw new Error('Missing project_id')
    }

    const result = reprocessProjectService({
      projectId,
      allowActiveAgent: hasFlag(args, '--allow-active-agent'),
    })
    printJson({ ok: true, projectId, result })
    return
  }

  throw new Error(`Unknown projects command: ${action || '<empty>'}`)
}

const runCommits = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.commits.command',
    fields: {
      args: args.join(' '),
    },
  })
  const action = args[0]
  if (action !== 'list') {
    throw new Error(`Unknown commits command: ${action || '<empty>'}`)
  }

  const projectId = readOption(args, '--project')
  if (!projectId) {
    throw new Error('Missing --project')
  }

  const sinceNs = readIntOption(args, '--since_ns') ?? parseTimeToNs(readOption(args, '--since'))
  const untilNs = readIntOption(args, '--until_ns') ?? parseTimeToNs(readOption(args, '--until'))

  const commits = listCommitsService({
    projectId,
    sinceNs,
    untilNs,
    limit: readIntOption(args, '--limit'),
  })

  printJson({ commits })
}

const runCommit = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.commit.command',
    fields: {
      args: args.join(' '),
    },
  })
  const action = args[0]
  if (action !== 'show') {
    throw new Error(`Unknown commit command: ${action || '<empty>'}`)
  }

  const commitId = args[1]
  if (!commitId) {
    throw new Error('Missing commit_id')
  }

  const details = getCommitDetailsService(commitId)
  if (!details) {
    throw new Error(`Commit not found: ${commitId}`)
  }

  printJson(details)
}

const runFile = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.file.command',
    fields: {
      args: args.join(' '),
    },
  })
  const action = args[0]
  if (action !== 'history') {
    throw new Error(`Unknown file command: ${action || '<empty>'}`)
  }

  const projectId = readOption(args, '--project')
  const relPath = readOption(args, '--path')
  if (!projectId || !relPath) {
    throw new Error('Missing required --project or --path')
  }

  const history = getFileHistoryService({
    projectId,
    relPath,
    limit: readIntOption(args, '--limit'),
  })
  printJson({ history })
}

const runDiff = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.diff.command',
    fields: {
      args: args.join(' '),
    },
  })
  const projectId = readOption(args, '--project')
  const fromCommitId = readOption(args, '--from')
  const toCommitId = readOption(args, '--to')
  const onlyPath = readOption(args, '--path')
  if (!projectId || !fromCommitId || !toCommitId) {
    throw new Error('Missing required --project, --from, or --to')
  }

  const project = getProjectService(projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const from = getCommitDetailsService(fromCommitId)
  const to = getCommitDetailsService(toCommitId)
  if (!from || !to) {
    throw new Error('Could not resolve one or both commit ids')
  }
  if (from.commit.projectId !== projectId || to.commit.projectId !== projectId) {
    throw new Error('Both commits must belong to the requested --project')
  }

  const entries = listCommitRangeEntriesService({
    projectId,
    fromSequence: from.commit.sequenceNo,
    toSequence: to.commit.sequenceNo,
    relPath: onlyPath,
  })
  const diffEntries = buildRangeDiffEntries({
    mode: project.mode,
    entries,
  })

  const summary = {
    total: diffEntries.length,
    text: diffEntries.filter((entry) => entry.diffKind === 'text').length,
    metadata: diffEntries.filter((entry) => entry.diffKind === 'metadata').length,
    binary: diffEntries.filter((entry) => entry.diffKind === 'binary').length,
    unavailable: diffEntries.filter((entry) => entry.diffKind === 'unavailable').length,
  }

  printJson({
    mode: project.mode,
    projectId,
    from: from.commit,
    to: to.commit,
    summary,
    entries: diffEntries,
  })
}

const runDoctor = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.doctor.command',
    fields: {
      args: args.join(' '),
    },
  })
  const projectId = readOption(args, '--project')
  if (!projectId) {
    throw new Error('Missing --project')
  }

  const result = runDoctorService({
    projectId,
    repair: hasFlag(args, '--repair'),
  })
  printJson(result)
}

const runAgentCommand = async (args: string[]): Promise<void> => {
  cliLogger.log({
    event: 'cardinal.diff.cli.agent.command',
    fields: {
      args: args.join(' '),
    },
  })
  const action = args[0]
  if (action === 'run') {
    await runAgent()
    return
  }

  if (action === 'install') {
    installLaunchAgent()
    return
  }

  if (action === 'uninstall') {
    uninstallLaunchAgent()
    return
  }

  throw new Error(`Unknown agent command: ${action || '<empty>'}`)
}

export const runCli = async (args: string[]): Promise<void> => {
  try {
    cliLogger.log({
      event: 'cardinal.diff.cli.run.start',
      fields: {
        args: args.join(' '),
      },
    })

    const scope = args[0]
    const remainder = args.slice(1)

    if (!scope || scope === '--help' || scope === '-h') {
      usage()
      return
    }

    if (scope === 'projects') {
      await runProjects(remainder)
      return
    }

    if (scope === 'commits') {
      await runCommits(remainder)
      return
    }

    if (scope === 'commit') {
      await runCommit(remainder)
      return
    }

    if (scope === 'file') {
      await runFile(remainder)
      return
    }

    if (scope === 'diff') {
      await runDiff(remainder)
      return
    }

    if (scope === 'doctor') {
      await runDoctor(remainder)
      return
    }

    if (scope === 'agent') {
      await runAgentCommand(remainder)
      return
    }

    throw new Error(`Unknown command scope: ${scope}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cliLogger.log({
      event: 'cardinal.diff.cli.run.failed',
      level: 'error',
      outcome: 'error',
      error: error instanceof Error ? error : String(error),
      fields: {
        args: args.join(' '),
      },
    })
    console.error(`cardinaldiff error: ${message}`)
    usage()
    process.exitCode = 1
    return
  }
}
