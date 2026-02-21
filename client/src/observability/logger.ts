import { createWideEventLogger } from 'cardinal-observability'

export const clientLogger = createWideEventLogger({
  service: 'client',
  context: {
    package: 'client',
    runtime: 'browser',
  },
})
