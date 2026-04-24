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
  // @spec SPEC-DIFF-SCANNER
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
      expect(result.stats.directoriesScanned).toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects root and nested .gitignore files for full and subtree scans', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-scan-'))

    try {
      fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true })
      fs.writeFileSync(path.join(root, '.gitignore'), '*.log\n', 'utf8')
      fs.writeFileSync(path.join(root, 'src', '.gitignore'), '*.tmp\n!keep.tmp\n', 'utf8')
      fs.writeFileSync(path.join(root, 'debug.log'), 'ignore-root-log', 'utf8')
      fs.writeFileSync(path.join(root, 'src', 'file.tmp'), 'ignore-src-temp', 'utf8')
      fs.writeFileSync(path.join(root, 'src', 'keep.tmp'), 'keep-src-temp', 'utf8')
      fs.writeFileSync(path.join(root, 'src', 'nested', 'notes.txt'), 'keep-nested', 'utf8')

      const fullScan = scanProjectTree(root, [])
      expect(fullScan.entries.has('debug.log')).toBe(false)
      expect(fullScan.entries.has('src/file.tmp')).toBe(false)
      expect(fullScan.entries.has('src/keep.tmp')).toBe(true)
      expect(fullScan.entries.has('src/nested/notes.txt')).toBe(true)

      const subtreeScan = scanProjectSubtree(root, 'src', [])
      expect(subtreeScan.entries.has('src/file.tmp')).toBe(false)
      expect(subtreeScan.entries.has('src/keep.tmp')).toBe(true)
      expect(subtreeScan.entries.has('src/nested/notes.txt')).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('retains subtree root directory entries during targeted replacement', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-scan-'))

    try {
      fs.mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
      fs.writeFileSync(path.join(root, 'docs', 'specs', 'cardinal.md'), 'before', 'utf8')
      fs.writeFileSync(path.join(root, 'docs', 'guide.md'), 'guide', 'utf8')

      const previous = scanProjectTree(root, [])
      expect(previous.entries.has('docs/specs')).toBe(true)

      fs.writeFileSync(path.join(root, 'docs', 'specs', 'cardinal.md'), 'after', 'utf8')

      const subtree = scanProjectSubtree(root, 'docs/specs', [])
      expect(subtree.entries.has('docs/specs')).toBe(true)

      const next = replaceIndexRegions(previous.entries, [
        {
          root: 'docs/specs',
          entries: subtree.entries,
        },
      ])

      expect(next.has('docs/specs')).toBe(true)
      expect(next.has('docs/specs/cardinal.md')).toBe(true)
      expect(next.has('docs/guide.md')).toBe(true)
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
