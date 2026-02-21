import 'dotenv/config'
import {runCli} from './src/cli'

await runCli(process.argv.slice(2))
