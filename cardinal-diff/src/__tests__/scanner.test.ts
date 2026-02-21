import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getMinimalDirtyRoots,
  replaceIndexRegions,
  scanProjectSubtree,
  scanProjectTree,
} from '../scanner'
import type { IndexEntry } from '../types'

const makeFileEntry = (relPath: string, size: number): IndexEntry => ({
  relPath,
  kind: 'file',
  size,
  mtimeNs: 1,
  inode: size + 10,
  device: 1,
  modeBits: 0o644,
  hash: null,
  symlinkTarget: null,
})

describe('scanner', () => {
  it('scans project trees while respecting ignore rules', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-scan-'))

    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
      fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'console.log("ok")', 'utf8')
      fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), 'skip', 'utf8')

      const result = scanProjectTree(root, ['node_modules/**'])
      expect(result.entries.has('src/index.ts')).toBe(true)
      expect(result.entries.has('node_modules/pkg/index.js')).toBe(false)
      expect(result.stats.filesScanned).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('handles empty/missing subtrees gracefully', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-scan-'))

    try {
      const result = scanProjectSubtree(root, 'missing', [])
      expect(result.entries.size).toBe(0)
      expect(result.stats.directoriesScanned).toBeGreaterThan(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('reduces dirty paths to minimal roots and replaces index regions', () => {
    const roots = getMinimalDirtyRoots(['src', 'src/components', 'docs/readme', 'src/utils'])
    expect(roots).toEqual(['src', 'docs/readme'])

    const previous = new Map<string, IndexEntry>([
      ['src/old.ts', makeFileEntry('src/old.ts', 1)],
      ['docs/guide.md', makeFileEntry('docs/guide.md', 2)],
    ])
    const next = replaceIndexRegions(previous, [
      {
        root: 'src',
        entries: new Map<string, IndexEntry>([['src/new.ts', makeFileEntry('src/new.ts', 3)]]),
      },
    ])

    expect(next.has('src/old.ts')).toBe(false)
    expect(next.has('src/new.ts')).toBe(true)
    expect(next.has('docs/guide.md')).toBe(true)
  })
})
