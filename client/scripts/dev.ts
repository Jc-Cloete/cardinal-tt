import path from 'node:path'

type ProcessRow = {
  pid: number
  command: string
}

const parseProcessTable = (value: string): ProcessRow[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const firstSpace = line.indexOf(' ')
      if (firstSpace < 0) {
        return null
      }

      const pid = Number.parseInt(line.slice(0, firstSpace).trim(), 10)
      const command = line.slice(firstSpace + 1).trim()
      if (!Number.isFinite(pid) || command.length === 0) {
        return null
      }

      return { pid, command }
    })
    .filter((item): item is ProcessRow => item !== null)

const killStaleRepoEsbuildServices = async (): Promise<void> => {
  const repoRoot = path.resolve(import.meta.dir, '..', '..')
  const ps = Bun.spawn(['ps', '-axo', 'pid=,command='], {
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const output = await new Response(ps.stdout).text()
  await ps.exited

  const targetPrefix = `${repoRoot}${path.sep}node_modules${path.sep}@esbuild${path.sep}`
  const candidates = parseProcessTable(output).filter(
    (row) =>
      row.pid !== process.pid &&
      row.command.includes(targetPrefix) &&
      row.command.includes('--service='),
  )

  for (const candidate of candidates) {
    try {
      process.kill(candidate.pid, 'SIGTERM')
    } catch {
      // Process exited before termination signal; ignore.
    }
  }
}

const runVite = async (): Promise<number> => {
  const vite = Bun.spawn(['bunx', 'vite'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: process.env,
  })
  return vite.exited
}

await killStaleRepoEsbuildServices()
process.exit(await runVite())
