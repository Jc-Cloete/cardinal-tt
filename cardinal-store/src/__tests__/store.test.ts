import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCardinalStore, DEFAULT_IGNORE_PATTERNS, type IndexEntry } from '../index'

const makeTempDbPath = (): { rootDir: string; dbPath: string } => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-store-'))
  return { rootDir, dbPath: path.join(rootDir, 'cardinal.sqlite') }
}

const cleanup = (rootDir: string): void => {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

const makeFileEntry = (relPath: string, size: number, hash: string | null = null): IndexEntry => ({
  relPath,
  kind: 'file',
  size,
  mtimeNs: 1_700_000_000_000_000_000,
  inode: size + 10,
  device: 1,
  modeBits: 0o644,
  hash,
  symlinkTarget: null,
})

describe('cardinal-store createCardinalStore', () => {
  it('handles project lifecycle and duplicate root-path errors', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      expect(store.listProjects()).toEqual([])

      const project = store.addProject({
        name: 'project-a',
        rootPath: '/tmp/project-a',
        mode: 'metadata',
        hashPolicy: 'off',
        ignoreRules: [],
      })

      expect(project.ignoreRules).toEqual(DEFAULT_IGNORE_PATTERNS)
      expect(store.getProjectById(project.projectId)?.name).toBe('project-a')
      expect(store.getProjectByRootPath('/tmp/project-a')?.projectId).toBe(project.projectId)

      expect(() =>
        store.addProject({
          name: 'duplicate',
          rootPath: '/tmp/project-a',
          mode: 'metadata',
          hashPolicy: 'off',
          ignoreRules: [],
        }),
      ).toThrow()

      store.removeProject(project.projectId)
      expect(store.getProjectById(project.projectId)).toBeNull()
    } finally {
      cleanup(rootDir)
    }
  })

  it('writes and queries commits, entries, and history', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      const project = store.addProject({
        name: 'project-b',
        rootPath: '/tmp/project-b',
        mode: 'metadata',
        hashPolicy: 'off',
        ignoreRules: ['.git/**'],
      })

      const firstIndex = new Map<string, IndexEntry>([['src/a.ts', makeFileEntry('src/a.ts', 100)]])
      const firstCommit = store.writeCommit({
        projectId: project.projectId,
        startedAtNs: 100,
        endedAtNs: 200,
        eventCursorStart: '10',
        eventCursorEnd: '11',
        changes: [
          {
            relPath: 'src/a.ts',
            op: 'ADD',
            oldRelPath: null,
            before: null,
            after: { kind: 'file', size: 100, mtimeNs: 1, hash: null, inode: 1, device: 1 },
            blobBefore: null,
            blobAfter: null,
          },
        ],
        nextIndex: firstIndex,
      })

      expect(firstCommit?.sequenceNo).toBe(1)
      expect(store.readIndex(project.projectId).get('src/a.ts')?.size).toBe(100)

      const secondIndex = new Map<string, IndexEntry>([
        ['src/a.ts', makeFileEntry('src/a.ts', 120)],
      ])
      const secondCommit = store.writeCommit({
        projectId: project.projectId,
        startedAtNs: 300,
        endedAtNs: 400,
        eventCursorStart: '12',
        eventCursorEnd: '13',
        changes: [
          {
            relPath: 'src/a.ts',
            op: 'MODIFY',
            oldRelPath: null,
            before: { kind: 'file', size: 100, mtimeNs: 1, hash: null, inode: 1, device: 1 },
            after: { kind: 'file', size: 120, mtimeNs: 2, hash: null, inode: 1, device: 1 },
            blobBefore: null,
            blobAfter: null,
          },
        ],
        nextIndex: secondIndex,
      })

      expect(secondCommit?.sequenceNo).toBe(2)
      expect(secondCommit?.parentCommitId).toBe(firstCommit?.commitId)
      expect(store.listCommits({ projectId: project.projectId, limit: 10 })).toHaveLength(2)
      expect(
        store.listCommitsBySequenceRange({
          projectId: project.projectId,
          fromSequence: 1,
          toSequence: 2,
        }),
      ).toHaveLength(2)

      const entries = store.getCommitEntries(secondCommit?.commitId || '')
      expect(entries).toHaveLength(1)
      expect(entries[0]?.op).toBe('MODIFY')
      expect(store.getCommit(firstCommit?.commitId || '')?.sequenceNo).toBe(1)

      const history = store.getFileHistory({
        projectId: project.projectId,
        relPath: 'src/a.ts',
        limit: 20,
      })
      expect(history).toHaveLength(2)
    } finally {
      cleanup(rootDir)
    }
  })

  it('returns null for empty commit batches and reports heartbeat state', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      const project = store.addProject({
        name: 'project-c',
        rootPath: '/tmp/project-c',
        mode: 'metadata',
        hashPolicy: 'off',
        ignoreRules: ['dist/**'],
      })

      const commit = store.writeCommit({
        projectId: project.projectId,
        startedAtNs: 0,
        endedAtNs: 1,
        eventCursorStart: null,
        eventCursorEnd: null,
        changes: [],
        nextIndex: new Map(),
      })
      expect(commit).toBeNull()

      expect(store.getLatestHeartbeat()).toBeNull()
      store.recordHeartbeat({ projectCount: 2, agentPid: 9001 })
      const heartbeat = store.getLatestHeartbeat()
      expect(heartbeat?.projectCount).toBe(2)
      expect(heartbeat?.agentPid).toBe(9001)
      expect(typeof heartbeat?.createdAt).toBe('string')
    } finally {
      cleanup(rootDir)
    }
  })

  it('throws when opened against an invalid sqlite path', () => {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-store-invalid-'))

    try {
      expect(() => createCardinalStore(dirPath)).toThrow()
    } finally {
      cleanup(dirPath)
    }
  })
})
