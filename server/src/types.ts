export type DirEntry = {
  name: string
  type: 'dir' | 'file'
}

export type SessionSegment = {
  startedAt: string
  endedAt: string
}

export type SessionSummary = {
  projectDir: string
  startedAt: string
  endedAt: string
  segments: SessionSegment[]
}

export type SessionFile = {
  name: string
  projectDir: string
  startedAt: string
  endedAt: string
  segments: SessionSegment[]
  sizeBytes: number
  modifiedAt: string
}

export type ProcessedSession = {
  filePath: string
  dayKey: string
  name: string
  fileHash: string
  sizeBytes: number
  modifiedAt: string
  projectDir: string
  timestampsMs: number[]
  filteredContent: string
}

export type ParsedSessionContent = {
  projectDir: string
  timestampsMs: number[]
  filteredContent: string
}

export type JsonRecord = Record<string, unknown>

export type CardinalProject = {
  projectId: string
  name: string
  rootPath: string
  enabled: boolean
  mode: string
  hashPolicy: string
  updatedAt: string
}

export type CardinalCommit = {
  commitId: string
  projectId: string
  parentCommitId: string | null
  sequenceNo: number
  startedAtNs: number
  endedAtNs: number
  eventCursorStart: string | null
  eventCursorEnd: string | null
  changeCount: number
}

export type CardinalCommitEntry = {
  relPath: string
  op: string
  oldRelPath: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  blobBefore: string | null
  blobAfter: string | null
}

export type CardinalFileHistoryEntry = {
  commitId: string
  relPath: string
  op: string
  oldRelPath: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  sequenceNo: number
  startedAtNs: number
  endedAtNs: number
  blobBefore: string | null
  blobAfter: string | null
}

export type CardinalDiffEntry = {
  commitId: string
  sequenceNo: number
  startedAtNs: number
  endedAtNs: number
  relPath: string
  op: string
  oldRelPath: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  blobBefore: string | null
  blobAfter: string | null
  diffKind: 'metadata' | 'text' | 'binary' | 'unavailable'
  patch: string | null
  patchTruncated: boolean
}
