import { createHash } from 'node:crypto'

export const computeStableHash = (content: string): string =>
  createHash('sha256').update(content).digest('hex')
