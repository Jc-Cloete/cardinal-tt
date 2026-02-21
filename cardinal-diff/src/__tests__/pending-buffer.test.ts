import { describe, expect, it } from 'bun:test'
import { mergePendingChanges } from '../pending-buffer'
import type { ChangedEntry } from '../types'

const makeEntry = (
  entry: Partial<ChangedEntry> & Pick<ChangedEntry, 'relPath' | 'op'>,
): ChangedEntry => ({
  relPath: entry.relPath,
  op: entry.op,
  oldRelPath: entry.oldRelPath ?? null,
  before: entry.before ?? null,
  after: entry.after ?? null,
  blobBefore: entry.blobBefore ?? null,
  blobAfter: entry.blobAfter ?? null,
})

describe('pending-buffer mergePendingChanges', () => {
  it('keeps ADD entries while folding later MODIFY updates', () => {
    const pending = new Map<string, ChangedEntry>()
    const merged = mergePendingChanges(pending, [
      makeEntry({
        relPath: 'src/file.ts',
        op: 'ADD',
        after: { kind: 'file', size: 10, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
      makeEntry({
        relPath: 'src/file.ts',
        op: 'MODIFY',
        after: { kind: 'file', size: 20, mtimeNs: 2, hash: null, inode: 1, device: 1 },
      }),
    ])

    expect(merged.size).toBe(1)
    expect(merged.get('src/file.ts')?.op).toBe('ADD')
    expect(merged.get('src/file.ts')?.after?.size).toBe(20)
  })

  it('drops ADD then DELETE pairs and converts DELETE then ADD into MODIFY', () => {
    const removed = mergePendingChanges(new Map<string, ChangedEntry>(), [
      makeEntry({
        relPath: 'src/a.ts',
        op: 'ADD',
        after: { kind: 'file', size: 1, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
      makeEntry({
        relPath: 'src/a.ts',
        op: 'DELETE',
        before: { kind: 'file', size: 1, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
    ])
    expect(removed.size).toBe(0)

    const resurrected = mergePendingChanges(new Map<string, ChangedEntry>(), [
      makeEntry({
        relPath: 'src/b.ts',
        op: 'DELETE',
        before: { kind: 'file', size: 2, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
      makeEntry({
        relPath: 'src/b.ts',
        op: 'ADD',
        after: { kind: 'file', size: 3, mtimeNs: 2, hash: null, inode: 1, device: 1 },
      }),
    ])
    expect(resurrected.get('src/b.ts')?.op).toBe('MODIFY')
  })

  it('folds source ADD into destination ADD when a rename occurs in the same batch', () => {
    const merged = mergePendingChanges(new Map<string, ChangedEntry>(), [
      makeEntry({
        relPath: 'src/old.ts',
        op: 'ADD',
        after: { kind: 'file', size: 1, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
      makeEntry({
        relPath: 'src/new.ts',
        op: 'RENAME',
        oldRelPath: 'src/old.ts',
        after: { kind: 'file', size: 1, mtimeNs: 1, hash: null, inode: 1, device: 1 },
      }),
    ])

    expect(merged.has('src/old.ts')).toBe(false)
    expect(merged.get('src/new.ts')?.op).toBe('ADD')
  })
})
