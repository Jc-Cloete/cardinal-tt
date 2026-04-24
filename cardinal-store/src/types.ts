// JSON value family shared across the repo for strongly typed parsed payloads.
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]

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

export type CommitEntryRow = {
  relPath: string
  op: string
  oldRelPath: string | null
  beforeJson: string | null
  afterJson: string | null
  blobBefore: string | null
  blobAfter: string | null
}

export type HeartbeatRow = {
  createdAt: string
  projectCount: number | null
  agentPid: number | null
}

export type JiraCachedProject = {
  jiraProjectId: string
  projectKey: string
  name: string
  projectType: string | null
  leadDisplayName: string | null
  avatarUrl: string | null
  rawJson: string
  cachedAt: string
}

export type JiraCachedIssue = {
  jiraIssueId: string
  issueKey: string
  projectKey: string
  summary: string
  statusId: string | null
  statusName: string | null
  issueType: string | null
  assigneeDisplayName: string | null
  priorityName: string | null
  updatedAt: string | null
  rawJson: string
  cachedAt: string
}

export type ActivityWindowEvent = {
  eventId: string
  observedAt: string
  appName: string
  windowTitle: string
  bundleId: string | null
  ownerPid: number | null
}

export type ActivityScreenshotAsset = {
  assetId: string
  sha256: string
  storagePath: string
  bytes: number
  width: number | null
  height: number | null
  createdAt: string
}

export type ActivityScreenshotFrame = {
  frameId: string
  observedAt: string
  assetId: string
}

export type ActivityHeartbeatRow = {
  createdAt: string
  agentPid: number | null
}
