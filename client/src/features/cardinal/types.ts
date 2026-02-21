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

export type CardinalProjectsResponse = {
  projects: CardinalProject[]
}

export type CardinalCommitsResponse = {
  commits: CardinalCommit[]
}

export type CardinalCommitDetailResponse = {
  commit: CardinalCommit
  entries: CardinalCommitEntry[]
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

export type CardinalDiffResponse = {
  project: CardinalProject
  fromCommit: CardinalCommit
  toCommit: CardinalCommit
  entryCount: number
  entries: CardinalDiffEntry[]
}
