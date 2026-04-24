import type { CorsOptions } from 'cors'
import type { NextFunction, Request, Response } from 'express'

const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const isAllowedLocalOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true
  }

  try {
    const parsed = new URL(origin)
    const isLocalHost = localHostnames.has(parsed.hostname.toLowerCase())
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    return isLocalHost && isHttp
  } catch {
    return false
  }
}

export const localCorsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedLocalOrigin(origin))
  },
}

export const enforceLocalOrigin = (req: Request, res: Response, next: NextFunction): void => {
  if (!isAllowedLocalOrigin(req.get('origin'))) {
    res.status(403).json({ error: 'Only local browser origins are allowed' })
    return
  }

  next()
}
