import 'dotenv/config'
import { runCli } from './src/cli'
import { diffLogger } from './src/observability'

const entryLogger = diffLogger.child({
  component: 'entrypoint',
})

await entryLogger.runAsync(
  {
    event: 'cardinal.diff.entrypoint.run',
    fields: {
      argv: process.argv.slice(2).join(' '),
      pid: process.pid,
    },
  },
  async () => {
    await runCli(process.argv.slice(2))
  },
)
