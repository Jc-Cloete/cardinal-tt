import type { WideEventObject } from 'cardinal-observability'
import type { NextFunction, Request, Response } from 'express'
import { getRequestFields, serverLogger } from '../observability/logger'

export type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => void | Promise<void>

export const instrumentRoute =
  (event: string, handler: RouteHandler): RouteHandler =>
  async (req, res, next?: NextFunction) => {
    const startedAt = Date.now()
    const baseFields = getRequestFields(req)
    const urlParts = req.originalUrl.split('?')

    try {
      await handler(req, res)
      serverLogger.log({
        event,
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        outcome: res.statusCode >= 400 ? 'error' : 'success',
        fields: {
          ...baseFields,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
          query_string: urlParts[1] || '',
        },
      })
    } catch (error) {
      const status = error instanceof Error && 'status' in error ? Number(error.status) : 500
      serverLogger.log({
        event,
        level: status >= 500 ? 'error' : 'warn',
        outcome: 'error',
        error: error instanceof Error ? error : String(error),
        fields: {
          ...baseFields,
          status_code: Number.isFinite(status) ? status : 500,
          duration_ms: Date.now() - startedAt,
          query_string: urlParts[1] || '',
        },
      })
      if (next) {
        next(error)
      }
    }
  }

export const toRouteFields = (fields: WideEventObject): WideEventObject => fields

export const parseRangeIso = (
  fromRaw: string,
  toRaw: string,
): { fromIso: string; toIso: string } | null => {
  const fromMs = Date.parse(fromRaw)
  const toMs = Date.parse(toRaw)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return null
  }

  const startMs = Math.min(fromMs, toMs)
  const endMs = Math.max(fromMs, toMs)
  return {
    fromIso: new Date(startMs).toISOString(),
    toIso: new Date(endMs).toISOString(),
  }
}

export const parseLimit = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(parsed, max))
}
