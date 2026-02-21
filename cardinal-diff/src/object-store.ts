import {createHash} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {objectsDir} from './paths'

const computeHash = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex')

const getObjectPath = (hash: string): string => {
  const shardA = hash.slice(0, 2)
  const shardB = hash.slice(2, 4)
  return path.join(objectsDir, shardA, shardB, `${hash}.blob`)
}

export const hasBlob = (hash: string): boolean => fs.existsSync(getObjectPath(hash))

export const readBlob = (hash: string): Buffer | null => {
  const filePath = getObjectPath(hash)
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

export const writeBlob = (content: Buffer): string => {
  const hash = computeHash(content)
  const filePath = getObjectPath(hash)
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true})
    fs.writeFileSync(filePath, content)
  }

  return hash
}

export const storeBlobFromFile = (filePath: string, maxBytes: number): string | null => {
  try {
    const stats = fs.statSync(filePath)
    if (!stats.isFile() || stats.size > maxBytes) {
      return null
    }

    return writeBlob(fs.readFileSync(filePath))
  } catch {
    return null
  }
}

export const isLikelyText = (content: Buffer): boolean => {
  if (content.length === 0) {
    return true
  }

  const sample = content.subarray(0, Math.min(content.length, 32 * 1024))
  let nulCount = 0
  for (const byte of sample) {
    if (byte === 0) {
      nulCount += 1
    }
  }

  if (nulCount / sample.length > 0.01) {
    return false
  }

  try {
    new TextDecoder('utf-8', {fatal: true}).decode(sample)
    return true
  } catch {
    return false
  }
}

export const readTextBlob = (hash: string): string | null => {
  const content = readBlob(hash)
  if (!content || !isLikelyText(content)) {
    return null
  }

  return new TextDecoder('utf-8').decode(content)
}
