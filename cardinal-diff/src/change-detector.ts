import path from 'node:path'
import { hashFile } from './hash'
import { storeBlobFromFile } from './object-store'
import type { ChangedEntry, EntrySnapshot, HashPolicy, IndexEntry, ProjectMode } from './types'

const isUnderAnyScope = (relPath: string, scopes: string[]): boolean =>
  scopes.length === 0 ||
  scopes.some((scope) => scope === '' || relPath === scope || relPath.startsWith(`${scope}/`))

const entryChanged = (before: IndexEntry, after: IndexEntry): boolean =>
  before.kind !== after.kind ||
  before.size !== after.size ||
  before.mtimeNs !== after.mtimeNs ||
  before.inode !== after.inode ||
  before.device !== after.device ||
  before.symlinkTarget !== after.symlinkTarget

const toSnapshot = (entry: IndexEntry): EntrySnapshot => ({
  kind: entry.kind,
  size: entry.size,
  mtimeNs: entry.mtimeNs,
  hash: entry.hash,
  inode: entry.inode,
  device: entry.device,
})

const computeContentRef = (
  projectRoot: string,
  relPath: string,
  entry: IndexEntry | undefined,
  mode: ProjectMode,
  hashPolicy: HashPolicy,
  maxBlobSizeBytes: number,
): string | null => {
  if (!entry || entry.kind !== 'file') {
    return null
  }

  const absolute = path.join(projectRoot, relPath)
  if (mode === 'content') {
    return storeBlobFromFile(absolute, maxBlobSizeBytes)
  }

  if (hashPolicy === 'on_change') {
    return hashFile(absolute)
  }

  return null
}

type BuildChangesetInput = {
  projectRoot: string
  previousIndex: Map<string, IndexEntry>
  currentIndex: Map<string, IndexEntry>
  changedScopes: string[]
  mode: ProjectMode
  hashPolicy: HashPolicy
  maxBlobSizeBytes: number
}

type BuildChangesetResult = {
  changes: ChangedEntry[]
  nextIndex: Map<string, IndexEntry>
}

export const buildChangeset = ({
  projectRoot,
  previousIndex,
  currentIndex,
  changedScopes,
  mode,
  hashPolicy,
  maxBlobSizeBytes,
}: BuildChangesetInput): BuildChangesetResult => {
  // Two-phase detection: classify adds/deletes/modifies first, then resolve best-effort renames.
  const changes: ChangedEntry[] = []
  const nextIndex = new Map(currentIndex)
  const adds = new Map<string, IndexEntry>()
  const deletes = new Map<string, IndexEntry>()

  const affectedPaths = new Set<string>()
  for (const relPath of previousIndex.keys()) {
    if (isUnderAnyScope(relPath, changedScopes)) {
      affectedPaths.add(relPath)
    }
  }
  for (const relPath of currentIndex.keys()) {
    if (isUnderAnyScope(relPath, changedScopes)) {
      affectedPaths.add(relPath)
    }
  }

  for (const relPath of affectedPaths) {
    const before = previousIndex.get(relPath)
    const current = currentIndex.get(relPath)

    if (!before && current) {
      adds.set(relPath, current)
      continue
    }

    if (before && !current) {
      deletes.set(relPath, before)
      continue
    }

    if (!before || !current) {
      continue
    }

    if (!entryChanged(before, current)) {
      if (before.hash && current.kind === 'file') {
        nextIndex.set(relPath, { ...current, hash: before.hash })
      }
      continue
    }

    const nextRef = computeContentRef(
      projectRoot,
      relPath,
      current,
      mode,
      hashPolicy,
      maxBlobSizeBytes,
    )
    if (
      hashPolicy === 'on_change' &&
      before.kind === 'file' &&
      current.kind === 'file' &&
      before.hash &&
      nextRef &&
      before.hash === nextRef
    ) {
      nextIndex.set(relPath, { ...current, hash: before.hash })
      continue
    }

    const updatedCurrent = { ...current, hash: nextRef ?? current.hash }
    nextIndex.set(relPath, updatedCurrent)

    changes.push({
      relPath,
      op: 'MODIFY',
      oldRelPath: null,
      before: toSnapshot(before),
      after: toSnapshot(updatedCurrent),
      blobBefore: before.hash,
      blobAfter: nextRef,
    })
  }

  const deletedByInodeKey = new Map<string, string[]>()
  for (const [relPath, entry] of deletes.entries()) {
    const key = `${entry.device}:${entry.inode}:${entry.kind}`
    const bucket = deletedByInodeKey.get(key) || []
    bucket.push(relPath)
    deletedByInodeKey.set(key, bucket)
  }

  const consumedAdds = new Set<string>()
  const consumedDeletes = new Set<string>()
  const addHashes = new Map<string, string>()

  for (const [addPath, added] of adds.entries()) {
    const key = `${added.device}:${added.inode}:${added.kind}`
    const candidates = deletedByInodeKey.get(key)
    const deletePath = candidates?.find((item) => !consumedDeletes.has(item))

    if (!deletePath) {
      continue
    }

    const before = deletes.get(deletePath)
    if (!before) {
      continue
    }

    const afterRef = computeContentRef(
      projectRoot,
      addPath,
      added,
      mode,
      hashPolicy,
      maxBlobSizeBytes,
    )
    const after = { ...added, hash: afterRef }
    nextIndex.set(addPath, after)

    changes.push({
      relPath: addPath,
      op: 'RENAME',
      oldRelPath: deletePath,
      before: toSnapshot(before),
      after: toSnapshot(after),
      blobBefore: before.hash,
      blobAfter: afterRef,
    })

    consumedAdds.add(addPath)
    consumedDeletes.add(deletePath)
  }

  for (const [addPath, entry] of adds.entries()) {
    if (consumedAdds.has(addPath)) {
      continue
    }

    const ref = computeContentRef(projectRoot, addPath, entry, mode, hashPolicy, maxBlobSizeBytes)
    if (ref) {
      addHashes.set(addPath, ref)
    }
  }

  const deletedByHash = new Map<string, string[]>()
  for (const [deletePath, entry] of deletes.entries()) {
    if (consumedDeletes.has(deletePath) || !entry.hash) {
      continue
    }
    const bucket = deletedByHash.get(entry.hash) || []
    bucket.push(deletePath)
    deletedByHash.set(entry.hash, bucket)
  }

  for (const [addPath, added] of adds.entries()) {
    if (consumedAdds.has(addPath)) {
      continue
    }

    const addHash = addHashes.get(addPath)
    if (!addHash) {
      continue
    }

    const deleteCandidates = deletedByHash.get(addHash)
    const deletePath = deleteCandidates?.find((candidate) => !consumedDeletes.has(candidate))
    if (!deletePath) {
      continue
    }

    const before = deletes.get(deletePath)
    if (!before) {
      continue
    }

    const after = { ...added, hash: addHash }
    nextIndex.set(addPath, after)

    changes.push({
      relPath: addPath,
      op: 'RENAME',
      oldRelPath: deletePath,
      before: toSnapshot(before),
      after: toSnapshot(after),
      blobBefore: before.hash,
      blobAfter: addHash,
    })

    consumedAdds.add(addPath)
    consumedDeletes.add(deletePath)
  }

  for (const [relPath, entry] of adds.entries()) {
    if (consumedAdds.has(relPath)) {
      continue
    }

    const afterRef =
      addHashes.get(relPath) ||
      computeContentRef(projectRoot, relPath, entry, mode, hashPolicy, maxBlobSizeBytes)
    const after = { ...entry, hash: afterRef }
    nextIndex.set(relPath, after)

    changes.push({
      relPath,
      op: 'ADD',
      oldRelPath: null,
      before: null,
      after: toSnapshot(after),
      blobBefore: null,
      blobAfter: afterRef,
    })
  }

  for (const [relPath, before] of deletes.entries()) {
    if (consumedDeletes.has(relPath)) {
      continue
    }

    changes.push({
      relPath,
      op: 'DELETE',
      oldRelPath: null,
      before: toSnapshot(before),
      after: null,
      blobBefore: before.hash,
      blobAfter: null,
    })
  }

  changes.sort((a, b) => a.relPath.localeCompare(b.relPath))

  return {
    changes,
    nextIndex,
  }
}
