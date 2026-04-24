import { Router } from 'express'
import { activityRouter } from './activity-routes'
import { cardinalRouter } from './cardinal-routes'
import { jiraRouter } from './jira-routes'
import { sessionRouter } from './session-routes'

export const apiRouter = Router()

apiRouter.use(sessionRouter)
apiRouter.use(activityRouter)
apiRouter.use(jiraRouter)
apiRouter.use(cardinalRouter)
