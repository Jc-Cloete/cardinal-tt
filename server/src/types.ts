import type { HashPolicy, JsonObject, ProjectMode } from 'cardinal-store'

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
  relativePath: string
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

export type JsonRecord = JsonObject

export type CardinalProject = {
  projectId: string
  name: string
  rootPath: string
  enabled: boolean
  mode: ProjectMode
  hashPolicy: HashPolicy
  updatedAt: string
}

export type CardinalHeartbeatStatus = {
  healthy: boolean
  staleAfterSeconds: number
  secondsSinceHeartbeat: number | null
  lastHeartbeatAt: string | null
  projectCount: number | null
  agentPid: number | null
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
  before: JsonObject | null
  after: JsonObject | null
  blobBefore: string | null
  blobAfter: string | null
}

export type CardinalFileHistoryEntry = {
  commitId: string
  relPath: string
  op: string
  oldRelPath: string | null
  before: JsonObject | null
  after: JsonObject | null
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
  before: JsonObject | null
  after: JsonObject | null
  blobBefore: string | null
  blobAfter: string | null
  diffKind: 'metadata' | 'text' | 'binary' | 'unavailable'
  patch: string | null
  patchTruncated: boolean
}

export type JiraProject = {
  jiraProjectId: string
  projectKey: string
  name: string
  projectType: string | null
  leadDisplayName: string | null
  avatarUrl: string | null
}

export type JiraIssue = {
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
}

export type JiraTransition = {
  transitionId: string
  name: string
  toStatusId: string | null
  toStatusName: string | null
}

export type ActivityWindowEvent = {
  eventId: string
  observedAt: string
  appName: string
  windowTitle: string
  bundleId: string | null
  ownerPid: number | null
}

export type ActivityScreenshotFrame = {
  frameId: string
  observedAt: string
  assetId: string
  bytes: number
  width: number | null
  height: number | null
  url: string
}

export type ActivityHeartbeatStatus = {
  healthy: boolean
  staleAfterSeconds: number
  secondsSinceHeartbeat: number | null
  lastHeartbeatAt: string | null
  agentPid: number | null
}
