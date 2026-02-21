import { createTraceId, createWideEventLogger, type WideEventObject } from 'cardinal-observability'
import type { Request } from 'express'

export const serverLogger = createWideEventLogger({
  service: 'server',
  context: {
    package: 'server',
    runtime: 'bun',
  },
})

export const getRequestFields = (req: Request): WideEventObject => ({
  request_id: String(req.headers['x-request-id'] || createTraceId()),
  method: req.method,
  path: req.path,
  original_url: req.originalUrl,
  ip: String(req.ip || ''),
})
