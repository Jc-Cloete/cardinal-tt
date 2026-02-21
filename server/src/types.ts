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
