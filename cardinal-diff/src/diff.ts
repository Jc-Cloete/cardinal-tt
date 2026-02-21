import { createPatch } from 'diff'
import { isLikelyText, readBlob, readTextBlob } from './object-store'
import type { CommitRangeEntry } from './service'
import type { JsonObject, JsonValue, ProjectMode } from './types'

const MAX_PATCH_CHARS = 50_000

const parseJson = (value: string | null): JsonObject | null => {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as JsonValue
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as JsonObject
    }
  } catch {
    return null
  }
  return null
}

const truncatePatch = (value: string): { patch: string; truncated: boolean } => {
  if (value.length <= MAX_PATCH_CHARS) {
    return { patch: value, truncated: false }
  }
  return {
    patch: `${value.slice(0, MAX_PATCH_CHARS)}\n... patch truncated ...\n`,
    truncated: true,
  }
}

const toPatch = (
  relPath: string,
  oldRelPath: string | null,
  beforeText: string,
  afterText: string,
): { patch: string; truncated: boolean } => {
  const source = oldRelPath || relPath
  const rendered = createPatch(relPath, beforeText, afterText, source, relPath, { context: 3 })
  return truncatePatch(rendered)
}

export type DiffEntryKind = 'metadata' | 'text' | 'binary' | 'unavailable'

export type DiffEntry = {
  commitId: string
  sequenceNo: number
  startedAtNs: number
  endedAtNs: number
  relPath: string
  op: string
  oldRelPath: string | null
  before: JsonObject | null
  after: JsonObject | null
  blobBefore: string | null
  blobAfter: string | null
  diffKind: DiffEntryKind
  patch: string | null
  patchTruncated: boolean
}

type BuildRangeDiffInput = {
  mode: ProjectMode
  entries: CommitRangeEntry[]
}

export const buildRangeDiffEntries = ({ mode, entries }: BuildRangeDiffInput): DiffEntry[] =>
  entries.map(({ commit, entry }) => {
    // Start with metadata projection; content diffing is layered in for content mode.
    const base: DiffEntry = {
      commitId: commit.commitId,
      sequenceNo: commit.sequenceNo,
      startedAtNs: commit.startedAtNs,
      endedAtNs: commit.endedAtNs,
      relPath: entry.relPath,
      op: entry.op,
      oldRelPath: entry.oldRelPath,
      before: parseJson(entry.beforeJson),
      after: parseJson(entry.afterJson),
      blobBefore: entry.blobBefore,
      blobAfter: entry.blobAfter,
      diffKind: 'metadata',
      patch: null,
      patchTruncated: false,
    }

    if (mode !== 'content') {
      return base
    }

    const beforeBlob = entry.blobBefore ? readBlob(entry.blobBefore) : null
    const afterBlob = entry.blobAfter ? readBlob(entry.blobAfter) : null
    const beforeText = entry.blobBefore ? readTextBlob(entry.blobBefore) : ''
    const afterText = entry.blobAfter ? readTextBlob(entry.blobAfter) : ''

    if ((beforeBlob && beforeText === null) || (afterBlob && afterText === null)) {
      return {
        ...base,
        diffKind: 'binary',
      }
    }

    if (
      (entry.blobBefore && !beforeBlob) ||
      (entry.blobAfter && !afterBlob) ||
      (beforeBlob && !isLikelyText(beforeBlob) && beforeText === null) ||
      (afterBlob && !isLikelyText(afterBlob) && afterText === null)
    ) {
      return {
        ...base,
        diffKind: 'unavailable',
      }
    }

    const patchResult = toPatch(entry.relPath, entry.oldRelPath, beforeText ?? '', afterText ?? '')
    return {
      ...base,
      diffKind: 'text',
      patch: patchResult.patch,
      patchTruncated: patchResult.truncated,
    }
  })
