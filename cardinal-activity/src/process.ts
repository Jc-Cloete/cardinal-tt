import { activityLogger } from './observability'

const processLogger = activityLogger.child({ component: 'process' })

export const runCommand = async (
  cmd: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  const proc = Bun.spawn({
    cmd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  processLogger.log({
    event: 'cardinal.activity.process.run',
    level: exitCode === 0 ? 'debug' : 'warn',
    outcome: exitCode === 0 ? 'success' : 'error',
    fields: {
      command: cmd.join(' '),
      exit_code: exitCode,
      stdout_bytes: stdout.length,
      stderr_bytes: stderr.length,
    },
  })

  return { exitCode, stdout, stderr }
}
