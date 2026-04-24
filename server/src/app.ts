import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { serverLogger } from './observability/logger'
import { apiRouter } from './routes/api'
import { enforceLocalOrigin, localCorsOptions } from './security'

// Express app composition stays minimal; domain behavior lives under routes/services.
export const createApp = () => {
  const app = express()

  app.use(enforceLocalOrigin)
  app.use(cors(localCorsOptions))
  app.use(express.json())

  app.use('/api', apiRouter)

  app.use(
    (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const status = error.status || 500
      serverLogger.log({
        event: 'server.http.unhandled_error',
        level: status >= 500 ? 'error' : 'warn',
        fields: {
          status_code: status,
        },
        outcome: 'error',
        error,
      })
      res.status(status).json({ error: error.message || 'Server error' })
    },
  )

  return app
}
