export type ProjectMode = 'metadata' | 'content'
export type HashPolicy = 'off' | 'on_change'

export type EntryKind = 'file' | 'dir' | 'symlink'

export type ChangeOp = 'ADD' | 'MODIFY' | 'DELETE' | 'RENAME'

export type ProjectConfig = {
  projectId: string
  name: string
  rootPath: string
  enabled: boolean
  ignoreRules: string[]
  mode: ProjectMode
  hashPolicy: HashPolicy
  maxBlobSizeBytes: number
  debounceMs: number
  commitIdleMs: number
  commitMaxIntervalMs: number
  lastEventCursor: string | null
}

export type IndexEntry = {
  relPath: string
  kind: EntryKind
  size: number
  mtimeNs: number
  inode: number
  device: number
  modeBits: number | null
  hash: string | null
  symlinkTarget: string | null
}

export type EntrySnapshot = {
  kind: EntryKind
  size: number
  mtimeNs: number
  hash: string | null
  inode: number
  device: number
}

export type ChangedEntry = {
  relPath: string
  op: ChangeOp
  oldRelPath: string | null
  before: EntrySnapshot | null
  after: EntrySnapshot | null
  blobBefore: string | null
  blobAfter: string | null
}

export type CommitRecord = {
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

export type ScanStats = {
  directoriesScanned: number
  filesScanned: number
  elapsedMs: number
}
