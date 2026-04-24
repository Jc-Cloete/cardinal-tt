import 'dotenv/config'
import { runCli } from './src/cli'
import { activityLogger } from './src/observability'

const entryLogger = activityLogger.child({
  component: 'entrypoint',
})

await entryLogger.runAsync(
  {
    event: 'cardinal.activity.entrypoint.run',
    fields: {
      argv: process.argv.slice(2).join(' '),
      pid: process.pid,
    },
  },
  async () => {
    await runCli(process.argv.slice(2))
  },
)
