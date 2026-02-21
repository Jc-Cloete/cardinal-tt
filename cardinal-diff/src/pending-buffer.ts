import type {ChangedEntry} from './types'

const cloneEntry = (entry: ChangedEntry): ChangedEntry => ({
  relPath: entry.relPath,
  op: entry.op,
  oldRelPath: entry.oldRelPath,
  before: entry.before ? {...entry.before} : null,
  after: entry.after ? {...entry.after} : null,
  blobBefore: entry.blobBefore,
  blobAfter: entry.blobAfter,
})

const mergeIntoMap = (map: Map<string, ChangedEntry>, incoming: ChangedEntry): void => {
  if (incoming.op === 'RENAME' && incoming.oldRelPath) {
    const sourceExisting = map.get(incoming.oldRelPath)
    if (sourceExisting) {
      map.delete(incoming.oldRelPath)
      if (sourceExisting.op === 'ADD') {
        map.set(incoming.relPath, {
          relPath: incoming.relPath,
          op: 'ADD',
          oldRelPath: null,
          before: null,
          after: incoming.after,
          blobBefore: null,
          blobAfter: incoming.blobAfter,
        })
        return
      }

      map.set(incoming.relPath, {
        relPath: incoming.relPath,
        op: 'RENAME',
        oldRelPath: sourceExisting.oldRelPath || sourceExisting.relPath,
        before: sourceExisting.before || incoming.before,
        after: incoming.after,
        blobBefore: sourceExisting.blobBefore ?? incoming.blobBefore,
        blobAfter: incoming.blobAfter,
      })
      return
    }
  }

  const existing = map.get(incoming.relPath)
  if (!existing) {
    map.set(incoming.relPath, cloneEntry(incoming))
    return
  }

  if (incoming.op === 'MODIFY') {
    if (existing.op === 'ADD') {
      map.set(incoming.relPath, {...existing, after: incoming.after, blobAfter: incoming.blobAfter})
      return
    }

    if (existing.op === 'MODIFY' || existing.op === 'RENAME') {
      map.set(incoming.relPath, {
        ...existing,
        after: incoming.after,
        blobAfter: incoming.blobAfter,
      })
      return
    }
  }

  if (incoming.op === 'DELETE') {
    if (existing.op === 'ADD') {
      map.delete(incoming.relPath)
      return
    }

    map.set(incoming.relPath, {
      relPath: incoming.relPath,
      op: 'DELETE',
      oldRelPath: null,
      before: existing.before || incoming.before,
      after: null,
      blobBefore: existing.blobBefore ?? incoming.blobBefore,
      blobAfter: null,
    })
    return
  }

  if (incoming.op === 'ADD') {
    if (existing.op === 'DELETE') {
      map.set(incoming.relPath, {
        relPath: incoming.relPath,
        op: 'MODIFY',
        oldRelPath: null,
        before: existing.before,
        after: incoming.after,
        blobBefore: existing.blobBefore,
        blobAfter: incoming.blobAfter,
      })
      return
    }

    map.set(incoming.relPath, cloneEntry(incoming))
    return
  }

  map.set(incoming.relPath, cloneEntry(incoming))
}

export const mergePendingChanges = (
  pending: Map<string, ChangedEntry>,
  incoming: ChangedEntry[],
): Map<string, ChangedEntry> => {
  const next = new Map(pending)
  for (const entry of incoming) {
    mergeIntoMap(next, entry)
  }
  return next
}
