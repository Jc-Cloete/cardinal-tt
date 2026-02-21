import 'dotenv/config'
import { createApp } from './src/app'
import { port } from './src/config'
import { serverLogger } from './src/observability/logger'

const app = createApp()

app.listen(port, () => {
  serverLogger.log({
    event: 'server.start',
    fields: {
      port,
      url: `http://localhost:${port}`,
    },
  })
})
