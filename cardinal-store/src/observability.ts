import { createWideEventLogger } from 'cardinal-observability'

export const storeLogger = createWideEventLogger({
  service: 'cardinal-store',
  context: {
    package: 'cardinal-store',
    runtime: 'bun',
  },
})
