import { createWideEventLogger, type WideEventRecord } from 'cardinal-observability'

const stderrSink = (record: WideEventRecord): void => {
  const line = `${JSON.stringify(record)}\n`
  process.stderr.write(line)
}

export const diffLogger = createWideEventLogger({
  service: 'cardinal-diff',
  context: {
    package: 'cardinal-diff',
    runtime: 'bun',
  },
  sink: stderrSink,
})
