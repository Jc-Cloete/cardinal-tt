import fs from 'node:fs'
import path from 'node:path'
import {dataRoot} from '../config'
import type {DirEntry} from '../types'

export const resolveSafePath = (relativePath: string): string => {
  const safePath = path.normalize(relativePath).replace(/^\.{2,}/, '')
  const resolved = path.resolve(dataRoot, safePath)

  if (!resolved.startsWith(dataRoot)) {
    const err = new Error('Path traversal is not allowed') as Error & {status?: number}
    err.status = 403
    throw err
  }

  return resolved
}

export const readDir = (dirPath: string): DirEntry[] => {
  try {
    return fs
      .readdirSync(dirPath, {withFileTypes: true})
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
      }))
  } catch {
    return []
  }
}

export const toPosixPath = (value: string): string => value.split(path.sep).join('/')
