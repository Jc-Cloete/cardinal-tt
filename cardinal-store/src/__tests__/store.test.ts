import { Database } from 'bun:sqlite'
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

const seedLegacyCommitEntrySchema = (dbPath: string): void => {
  const db = new Database(dbPath)
  try {
    db.exec(`
      CREATE TABLE cardinal_projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        ignore_rules_json TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'metadata',
        hash_policy TEXT NOT NULL DEFAULT 'off',
        max_blob_size_bytes INTEGER NOT NULL DEFAULT 5242880,
        debounce_ms INTEGER NOT NULL DEFAULT 500,
        commit_idle_ms INTEGER NOT NULL DEFAULT 2000,
        commit_max_interval_ms INTEGER NOT NULL DEFAULT 60000,
        last_event_cursor TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE cardinal_commits (
        commit_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_commit_id TEXT,
        sequence_no INTEGER NOT NULL,
        started_at_ns INTEGER NOT NULL,
        ended_at_ns INTEGER NOT NULL,
        event_cursor_start TEXT,
        event_cursor_end TEXT,
        change_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE cardinal_commit_entries (
        entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        commit_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        op TEXT NOT NULL,
        old_rel_path TEXT,
        before_json TEXT,
        after_json TEXT
      );

      INSERT INTO cardinal_projects (
        project_id,
        name,
        root_path,
        enabled,
        ignore_rules_json,
        mode,
        hash_policy,
        max_blob_size_bytes,
        debounce_ms,
        commit_idle_ms,
        commit_max_interval_ms,
        last_event_cursor,
        created_at,
        updated_at
      ) VALUES (
        'legacy-project',
        'legacy',
        '/tmp/legacy',
        1,
        '[".git/**"]',
        'metadata',
        'off',
        5242880,
        500,
        2000,
        60000,
        NULL,
        '2026-02-21T10:00:00.000Z',
        '2026-02-21T10:00:00.000Z'
      );

      INSERT INTO cardinal_commits (
        commit_id,
        project_id,
        parent_commit_id,
        sequence_no,
        started_at_ns,
        ended_at_ns,
        event_cursor_start,
        event_cursor_end,
        change_count,
        created_at
      ) VALUES (
        'legacy-commit',
        'legacy-project',
        NULL,
        1,
        100,
        200,
        NULL,
        NULL,
        1,
        '2026-02-21T10:00:00.000Z'
      );

      INSERT INTO cardinal_commit_entries (
        commit_id,
        project_id,
        rel_path,
        op,
        old_rel_path,
        before_json,
        after_json
      ) VALUES (
        'legacy-commit',
        'legacy-project',
        'src/legacy.ts',
        'ADD',
        NULL,
        NULL,
        '{"kind":"file","size":10}'
      );
    `)
  } finally {
    db.close()
  }
}

describe('cardinal-store createCardinalStore', () => {
  // @spec SPEC-STORE-PROJECT-LIFECYCLE
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

  // @spec SPEC-STORE-COMMIT-HISTORY
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

  // @spec SPEC-STORE-HEARTBEAT
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

  // @spec SPEC-STORE-REPROCESS
  it('reprocesses a project by clearing project history and replacing index snapshot', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      const project = store.addProject({
        name: 'project-reprocess',
        rootPath: '/tmp/project-reprocess',
        mode: 'metadata',
        hashPolicy: 'off',
        ignoreRules: [],
      })

      const firstIndex = new Map<string, IndexEntry>([
        ['src/ignored.log', makeFileEntry('src/ignored.log', 10)],
      ])
      store.writeCommit({
        projectId: project.projectId,
        startedAtNs: 100,
        endedAtNs: 200,
        eventCursorStart: '10',
        eventCursorEnd: '11',
        changes: [
          {
            relPath: 'src/ignored.log',
            op: 'ADD',
            oldRelPath: null,
            before: null,
            after: { kind: 'file', size: 10, mtimeNs: 1, hash: null, inode: 1, device: 1 },
            blobBefore: null,
            blobAfter: null,
          },
        ],
        nextIndex: firstIndex,
      })
      store.recordProjectMetrics({
        projectId: project.projectId,
        queueDepth: 1,
        scanStats: { directoriesScanned: 1, filesScanned: 1, elapsedMs: 1 },
        changes: 1,
      })

      const nextIndex = new Map<string, IndexEntry>([
        ['src/keep.ts', makeFileEntry('src/keep.ts', 120)],
      ])
      store.reprocessProject({
        projectId: project.projectId,
        index: nextIndex,
        cursor: '42',
      })

      expect(store.listCommits({ projectId: project.projectId, limit: 50 })).toHaveLength(0)
      expect(
        store.getFileHistory({
          projectId: project.projectId,
          relPath: 'src/ignored.log',
          limit: 50,
        }),
      ).toHaveLength(0)
      expect(store.readIndex(project.projectId).has('src/ignored.log')).toBe(false)
      expect(store.readIndex(project.projectId).has('src/keep.ts')).toBe(true)
      expect(store.getProjectById(project.projectId)?.lastEventCursor).toBe('42')
    } finally {
      cleanup(rootDir)
    }
  })

  // @spec SPEC-STORE-JIRA-CACHE
  it('stores jira cache data with sync markers and supports issue upserts', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      const now = new Date().toISOString()

      store.replaceJiraProjects({
        syncedAt: now,
        projects: [
          {
            jiraProjectId: '10001',
            projectKey: 'APP',
            name: 'App Platform',
            projectType: 'software',
            leadDisplayName: 'Alice',
            avatarUrl: null,
            rawJson: '{"key":"APP"}',
            cachedAt: now,
          },
        ],
      })

      expect(store.getJiraSyncAt('projects')).toBe(now)
      expect(store.listJiraProjects()).toHaveLength(1)
      expect(store.listJiraProjects()[0]?.projectKey).toBe('APP')

      store.replaceJiraIssues({
        projectKey: 'APP',
        syncedAt: now,
        issues: [
          {
            jiraIssueId: '20001',
            issueKey: 'APP-1',
            projectKey: 'APP',
            summary: 'Initial setup',
            statusId: '11',
            statusName: 'To Do',
            issueType: 'Task',
            assigneeDisplayName: 'Bob',
            priorityName: 'High',
            updatedAt: now,
            rawJson: '{"key":"APP-1"}',
            cachedAt: now,
          },
        ],
      })

      expect(store.getJiraSyncAt('issues:APP')).toBe(now)
      expect(store.listJiraIssues('APP')).toHaveLength(1)
      expect(store.listJiraIssues('APP')[0]?.statusName).toBe('To Do')
      expect(store.listJiraIssueStatusOptions()).toEqual(['To Do'])
      expect(store.listJiraIssueAssigneeOptions()).toEqual(['Bob'])

      store.upsertJiraIssue({
        jiraIssueId: '20001',
        issueKey: 'APP-1',
        projectKey: 'APP',
        summary: 'Initial setup',
        statusId: '21',
        statusName: 'In Progress',
        issueType: 'Task',
        assigneeDisplayName: 'Bob',
        priorityName: 'High',
        updatedAt: now,
        rawJson: '{"key":"APP-1","status":"In Progress"}',
        cachedAt: now,
      })

      expect(store.listJiraIssues('APP')[0]?.statusName).toBe('In Progress')
      expect(store.listJiraIssueStatusOptions()).toEqual(['In Progress'])
      expect(store.listJiraIssueAssigneeOptions()).toEqual(['Bob'])
    } finally {
      cleanup(rootDir)
    }
  })

  // @spec SPEC-STORE-ACTIVITY-CACHE
  it('stores activity window events, screenshot assets/frames, and heartbeat', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      const store = createCardinalStore(dbPath)
      const first = '2026-02-22T10:00:00.000Z'
      const second = '2026-02-22T10:00:10.000Z'

      store.insertActivityWindowEvent({
        eventId: 'evt-1',
        observedAt: first,
        appName: 'Terminal',
        windowTitle: 'shell',
        bundleId: 'com.apple.Terminal',
        ownerPid: 1234,
      })
      store.insertActivityWindowEvent({
        eventId: 'evt-2',
        observedAt: second,
        appName: 'Firefox',
        windowTitle: 'Docs',
        bundleId: 'org.mozilla.firefox',
        ownerPid: 2345,
      })

      const windowEvents = store.listActivityWindowEvents({
        fromIso: '2026-02-22T09:59:00.000Z',
        toIso: '2026-02-22T10:01:00.000Z',
      })
      expect(windowEvents).toHaveLength(2)
      expect(windowEvents[0]?.appName).toBe('Terminal')

      store.upsertActivityScreenshotAsset({
        assetId: 'asset-1',
        sha256: 'hash-1',
        storagePath: '/tmp/asset-1.jpg',
        bytes: 1000,
        width: 1920,
        height: 1080,
        createdAt: first,
      })
      store.insertActivityScreenshotFrame({
        frameId: 'frame-1',
        observedAt: first,
        assetId: 'asset-1',
      })
      store.insertActivityScreenshotFrame({
        frameId: 'frame-2',
        observedAt: second,
        assetId: 'asset-1',
      })

      const storedAsset = store.getActivityScreenshotAssetById('asset-1')
      expect(storedAsset?.sha256).toBe('hash-1')
      expect(storedAsset?.bytes).toBe(1000)

      const frames = store.listActivityScreenshotFrames({
        fromIso: '2026-02-22T09:59:00.000Z',
        toIso: '2026-02-22T10:01:00.000Z',
      })
      expect(frames).toHaveLength(2)
      expect(frames[1]?.frameId).toBe('frame-2')

      expect(store.getLatestActivityHeartbeat()).toBeNull()
      store.recordActivityHeartbeat({ agentPid: 8888 })
      const activityHeartbeat = store.getLatestActivityHeartbeat()
      expect(activityHeartbeat?.agentPid).toBe(8888)
      expect(typeof activityHeartbeat?.createdAt).toBe('string')
    } finally {
      cleanup(rootDir)
    }
  })

  // @spec SPEC-STORE-INVALID-DB
  it('throws when opened against an invalid sqlite path', () => {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-store-invalid-'))

    try {
      expect(() => createCardinalStore(dirPath)).toThrow()
    } finally {
      cleanup(dirPath)
    }
  })

  // @spec SPEC-STORE-MIGRATION-REPAIR
  it('backfills derived commit entry timestamps for legacy schemas', () => {
    const { rootDir, dbPath } = makeTempDbPath()

    try {
      seedLegacyCommitEntrySchema(dbPath)
      const store = createCardinalStore(dbPath)

      expect(store.getCommitEntries('legacy-commit')[0]?.relPath).toBe('src/legacy.ts')

      const db = new Database(dbPath, { readonly: true })
      try {
        const row = db
          .query(
            `SELECT ended_at_ns FROM cardinal_commit_entries WHERE commit_id = 'legacy-commit'`,
          )
          .get() as { ended_at_ns: number } | null
        expect(row?.ended_at_ns).toBe(200)
      } finally {
        db.close()
      }
    } finally {
      cleanup(rootDir)
    }
  })
})
