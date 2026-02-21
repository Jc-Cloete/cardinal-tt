import 'dotenv/config'
import {createApp} from './src/app'
import {port} from './src/config'

const app = createApp()

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`)
})
