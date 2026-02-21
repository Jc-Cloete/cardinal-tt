import cors from 'cors'
import express, {type NextFunction, type Request, type Response} from 'express'
import {apiRouter} from './routes/api'

export const createApp = () => {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.use('/api', apiRouter)

  app.use((error: Error & {status?: number}, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || 500
    res.status(status).json({error: error.message || 'Server error'})
  })

  return app
}
