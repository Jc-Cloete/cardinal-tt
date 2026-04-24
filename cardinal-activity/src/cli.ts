import { randomUUID } from 'node:crypto'
import { runAgent } from './agent'
import { recordWindowSample } from './db'
import { activityLogger } from './observability'
import { captureScreenshot } from './screenshot'
import { readActiveWindowSample } from './window'

const cliLogger = activityLogger.child({ component: 'cli' })

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[]

const printJson = (value: JsonValue): void => {
  console.log(JSON.stringify(value, null, 2))
}

const usage = (): void => {
  console.log(
    ['cardinal-activity commands:', '  agent run', '  sample window', '  sample screenshot'].join(
      '\n',
    ),
  )
}

const runSample = async (args: string[]): Promise<void> => {
  const target = args[0]

  if (target === 'window') {
    const observedAt = new Date().toISOString()
    const sample = await readActiveWindowSample(observedAt)
    if (!sample) {
      throw new Error(
        'Failed to sample active window. Ensure Accessibility permissions are granted.',
      )
    }

    recordWindowSample(sample)
    printJson({ ok: true, event_id: randomUUID(), sample })
    return
  }

  if (target === 'screenshot') {
    const observedAt = new Date().toISOString()
    const capture = await captureScreenshot(observedAt)
    if (!capture) {
      throw new Error(
        'Failed to capture screenshot. Ensure Screen Recording permission is granted to your terminal.',
      )
    }

    printJson({ ok: true, capture })
    return
  }

  throw new Error(`Unknown sample target: ${target || '<empty>'}`)
}

export const runCli = async (args: string[]): Promise<void> => {
  await cliLogger.runAsync(
    {
      event: 'cardinal.activity.cli.run',
      fields: {
        args: args.join(' '),
      },
    },
    async () => {
      const command = args[0]

      if (!command || command === 'help' || command === '--help') {
        usage()
        return
      }

      if (command === 'agent') {
        const action = args[1]
        if (action !== 'run') {
          throw new Error(`Unknown agent action: ${action || '<empty>'}`)
        }
        await runAgent()
        return
      }

      if (command === 'sample') {
        await runSample(args.slice(1))
        return
      }

      throw new Error(`Unknown command: ${command}`)
    },
  )
}
