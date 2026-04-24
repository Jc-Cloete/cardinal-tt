# Spec: `cardinal-store` (Shared DB Layer)

Status: Active  
Scope: `cardinal-store`  
Consumers: `server`, `cardinal-diff`, `cardinal-activity`

## 1. Purpose

`cardinal-store` is the single source of truth for CardinalDiff persistence:

- Canonical SQLite schema
- Shared strict TypeScript data model
- Query/mutation API used by both writer (`cardinal-diff`) and reader (`server`)

This package exists to prevent schema drift between services.

## 2. Non-Goals

- No HTTP/API transport concerns
- No FSEvents/watcher logic
- No UI logic
- No filesystem scanning or diff generation

## 3. Public Contract

Entry point: `createCardinalStore(dbPath: string)`

Returned store capabilities:

- Project management: `listProjects`, `getProjectById`, `getProjectByRootPath`, `addProject`, `removeProject`
- Index management: `readIndex`, `setProjectIndexSnapshot`, `touchProjectCursor`
- Project maintenance: `reprocessProject` (clear project history and replace index snapshot/cursor atomically)
- Commit writing: `writeCommit`
- Metrics/heartbeat: `recordProjectMetrics`, `recordHeartbeat`, `getLatestHeartbeat`
- Activity tracking:
  - `insertActivityWindowEvent`, `listActivityWindowEvents`
  - `upsertActivityScreenshotAsset`, `getActivityScreenshotAssetById`
  - `insertActivityScreenshotFrame`, `listActivityScreenshotFrames`
  - `recordActivityHeartbeat`, `getLatestActivityHeartbeat`
- Jira cache:
  - `listJiraProjects`, `replaceJiraProjects`
  - `listJiraIssues`, `replaceJiraIssues`, `upsertJiraIssue`
  - `listJiraIssueStatusOptions`, `listJiraIssueAssigneeOptions`
  - `getJiraSyncAt`
- Commit/history queries: `listCommits`, `listCommitsBySequenceRange`, `getCommit`, `getCommitEntries`, `getFileHistory`

Type exports are canonical and must remain strict (no `any`/`unknown` in public models).

## 4. Storage Model

Primary tables:

- `cardinal_projects`
- `cardinal_index_entries`
- `cardinal_commits`
- `cardinal_commit_entries`
- `cardinal_metrics`
- `jira_projects`
- `jira_issues`
- `jira_sync_state`
- `activity_window_events`
- `activity_screenshot_assets`
- `activity_screenshot_frames`

Indexes:

- commits by project/time
- metrics by project/time
- commit entries by project/path/time

Schema upgrades:

- Additive migrations are handled in-process via `addColumnIfMissing(...)`.
- Backward compatibility for legacy columns (`content_hash_*`) is retained in commit entry reads.

## 5. Behavioral Requirements

1. `createCardinalStore` MUST ensure DB parent directory exists before opening SQLite.
2. DB initialization MUST enable:
   - WAL mode
   - Foreign keys
   - Busy timeout
3. `addProject` MUST:
   - enforce unique `root_path` via DB constraint
   - default empty ignore rules to package defaults
4. `writeCommit` MUST:
   - return `null` for empty change batches
   - derive parent/sequence from current commit head
   - write commit + entries + index replacement + cursor update in one transaction
5. `setProjectIndexSnapshot` MUST replace index and cursor atomically.
6. `reprocessProject` MUST clear project commit/history/index state and write the provided snapshot in one transaction.
7. Query APIs MUST cap `limit` values to prevent unbounded reads.
8. Jira cache replacement methods MUST update snapshot rows and sync markers atomically.
9. Jira filter option methods MUST return deduplicated, trimmed non-empty values sorted case-insensitively.

## 6. Data Integrity Invariants

- `(project_id, rel_path)` is unique in index entries.
- Commit sequences are monotonically increasing per project.
- Commit entries reference existing commits (FK).
- Project deletion cascades into index/commit data.

## 7. JSON and Parsing Rules

- Dynamic SQLite rows are normalized through typed guards (`JsonValue`, `JsonObject`).
- Parse failures MUST degrade safely to defaults (`null`/empty collections).
- Invalid row shapes MUST be filtered out instead of leaking partial invalid objects.

## 8. Performance and Reliability

- Designed for frequent append-style writes and many point/range reads.
- WAL + transaction boundaries are required for crash tolerance.
- Index replacement is acceptable because scan batches are bounded by agent batching semantics.

## 9. Security and Safety

- No remote IO.
- All SQL is parameterized via prepared statements.
- No dynamic SQL from user payloads except internal migration `PRAGMA table_info` and known table names.

## 10. Test Requirements

Minimum required coverage in this package:

- Happy path:
  - add project
  - write commits
  - list/query commits/history
- Error path:
  - duplicate root-path insert failure
  - invalid DB path/open failure
- Edge cases:
  - empty commit batch returns `null`
  - heartbeat absent/present behavior
  - reprocess resets prior commit history and seeds replacement index snapshot
  - jira cache replace/upsert behavior and sync marker updates
  - jira status/assignee option queries return expected distinct values from cached issues

## 11. Change Management

Any schema or type contract change MUST include:

1. Migration logic (if additive/compat required)
2. Updated tests for old + new behavior
3. Updates to:
   - `cardinal-store/README.md`
   - `docs/specs/cardinal_store.spec.md`
