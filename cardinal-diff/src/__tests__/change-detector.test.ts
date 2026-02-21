import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildChangeset } from '../change-detector'
import { hashFile } from '../hash'
import type { IndexEntry } from '../types'

const makeEntry = (relPath: string, values: Partial<IndexEntry> = {}): IndexEntry => ({
  relPath,
  kind: 'file',
  size: values.size ?? 1,
  mtimeNs: values.mtimeNs ?? 1,
  inode: values.inode ?? 1,
  device: values.device ?? 1,
  modeBits: values.modeBits ?? 0o644,
  hash: values.hash ?? null,
  symlinkTarget: values.symlinkTarget ?? null,
})

describe('change-detector buildChangeset', () => {
  it('detects add, modify, and delete changes', () => {
    const previous = new Map<string, IndexEntry>([
      ['a.ts', makeEntry('a.ts', { size: 10, inode: 11 })],
      ['b.ts', makeEntry('b.ts', { size: 20, inode: 12 })],
    ])
    const current = new Map<string, IndexEntry>([
      ['a.ts', makeEntry('a.ts', { size: 15, inode: 11, mtimeNs: 2 })],
      ['c.ts', makeEntry('c.ts', { size: 30, inode: 13 })],
    ])

    const result = buildChangeset({
      projectRoot: '/tmp',
      previousIndex: previous,
      currentIndex: current,
      changedScopes: [''],
      mode: 'metadata',
      hashPolicy: 'off',
      maxBlobSizeBytes: 1024,
    })

    expect(result.changes.map((item) => item.op)).toEqual(['MODIFY', 'DELETE', 'ADD'])
    expect(result.nextIndex.has('c.ts')).toBe(true)
    expect(result.nextIndex.has('b.ts')).toBe(false)
  })

  it('detects renames by matching inode/device pairs', () => {
    const previous = new Map<string, IndexEntry>([
      ['old.ts', makeEntry('old.ts', { inode: 99, device: 7, hash: 'h1' })],
    ])
    const current = new Map<string, IndexEntry>([
      ['new.ts', makeEntry('new.ts', { inode: 99, device: 7 })],
    ])

    const result = buildChangeset({
      projectRoot: '/tmp',
      previousIndex: previous,
      currentIndex: current,
      changedScopes: [''],
      mode: 'metadata',
      hashPolicy: 'off',
      maxBlobSizeBytes: 1024,
    })

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]?.op).toBe('RENAME')
    expect(result.changes[0]?.oldRelPath).toBe('old.ts')
  })

  it('skips metadata-only mtime churn when content hash remains unchanged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-hash-'))

    try {
      fs.writeFileSync(path.join(root, 'same.ts'), 'const x = 1;\n', 'utf8')
      const hash = hashFile(path.join(root, 'same.ts'))
      expect(hash).not.toBeNull()

      const previous = new Map<string, IndexEntry>([
        ['same.ts', makeEntry('same.ts', { mtimeNs: 1, hash: hash || null, inode: 77 })],
      ])
      const current = new Map<string, IndexEntry>([
        ['same.ts', makeEntry('same.ts', { mtimeNs: 2, hash: null, inode: 77 })],
      ])

      const result = buildChangeset({
        projectRoot: root,
        previousIndex: previous,
        currentIndex: current,
        changedScopes: [''],
        mode: 'metadata',
        hashPolicy: 'on_change',
        maxBlobSizeBytes: 1024,
      })

      expect(result.changes).toHaveLength(0)
      expect(result.nextIndex.get('same.ts')?.hash).toBe(hash)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('still reports modify when hash evaluation fails for missing files', () => {
    const previous = new Map<string, IndexEntry>([
      ['missing.ts', makeEntry('missing.ts', { mtimeNs: 1, hash: 'before' })],
    ])
    const current = new Map<string, IndexEntry>([
      ['missing.ts', makeEntry('missing.ts', { mtimeNs: 2, hash: null })],
    ])

    const result = buildChangeset({
      projectRoot: '/path/that/does/not/exist',
      previousIndex: previous,
      currentIndex: current,
      changedScopes: [''],
      mode: 'metadata',
      hashPolicy: 'on_change',
      maxBlobSizeBytes: 1024,
    })

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]?.op).toBe('MODIFY')
    expect(result.changes[0]?.blobAfter).toBeNull()
  })
})
