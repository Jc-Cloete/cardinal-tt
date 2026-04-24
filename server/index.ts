import 'dotenv/config'
import { createApp } from './src/app'
import { host, port } from './src/config'
import { serverLogger } from './src/observability/logger'

const app = createApp()

app.listen(port, host, () => {
  serverLogger.log({
    event: 'server.start',
    fields: {
      host,
      port,
      url: `http://${host}:${port}`,
    },
  })
})
