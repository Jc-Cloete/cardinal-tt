import { createWideEventLogger, type WideEventRecord } from 'cardinal-observability'

const stderrSink = (record: WideEventRecord): void => {
  process.stderr.write(`${JSON.stringify(record)}\n`)
}

export const activityLogger = createWideEventLogger({
  service: 'cardinal-activity',
  context: {
    package: 'cardinal-activity',
    runtime: 'bun',
  },
  sink: stderrSink,
})
