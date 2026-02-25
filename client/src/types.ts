export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export interface RootResponse {
  root: string
  conversation_break_limit?: number
  cache_db_path?: string
}

export interface YearsResponse {
  years: string[]
}

export interface MonthsResponse {
  months: string[]
}

export interface DaysResponse {
  days: string[]
}

export interface ProjectsResponse {
  projects: string[]
}

export interface SessionSegment {
  startedAt?: string
  endedAt?: string
}

export interface SessionFile {
  name: string
  relativePath: string
  projectDir: string
  startedAt: string
  endedAt: string
  segments?: SessionSegment[]
  sizeBytes: number
  modifiedAt: string
}

export interface FilesResponse {
  files: SessionFile[]
}

export interface ContentItem {
  type?: string
  text?: string
}

export interface ParsedResponseItemEntry {
  type?: string
  timestamp?: string
  payload?: {
    type?: string
    role?: string
    phase?: string
    content?: ContentItem[]
  }
}

export interface PreviewMessage {
  id: string
  role: string
  phase: string
  timestamp: string
  text: string
  lineCount: number
}

export interface DayBounds {
  startMs: number
  endMs: number
  totalMs: number
}

export interface RawTimelineItem {
  name: string
  relativePath: string
  projectDir: string
  fileIndex: number
  conversationIndex: number
  segmentIndex: number
  segmentCount: number
  startMs: number
  endMs: number
}

export interface TimelineGap {
  id: string
  durationMs: number
  durationLabel: string
  fromLabel: string
  toLabel: string
}

export interface TimelineTick {
  key: string
  label: string
  topPct: number
}

export interface TimelineItem extends RawTimelineItem {
  topPct: number
  heightPct: number
  startLabel: string
  endLabel: string
  laneIndex: number
  leftPct: number
  widthPct: number
}

export interface TimelineSection {
  id: string
  sectionHeightPx: number
  rangeLabel: string
  laneCount: number
  ticks: TimelineTick[]
  items: TimelineItem[]
}

export interface TimelineModel {
  hasData: boolean
  rangeStartMs: number | null
  rangeEndMs: number | null
  sections: TimelineSection[]
  gaps: TimelineGap[]
}

export type DateParts = {
  year: string
  month: string
  day: string
}
