import {createHash} from 'node:crypto'
import fs from 'node:fs'

export const hashFile = (filePath: string): string | null => {
  try {
    const content = fs.readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}
