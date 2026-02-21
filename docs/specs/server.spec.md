# Spec: `server` (Conversation + Cardinal API)

Status: Active  
Scope: `server`

## 1. Purpose

`server` provides one HTTP API surface for:

- Exploring Codex session data (`DATA_ROOT`)
- Returning filtered conversation previews
- Reading CardinalDiff state from shared SQLite (`cardinal-store` adapters)
- Integrating Jira with cache-aware project/issue workflows

## 2. Non-Goals

- No direct watcher/event ingestion (owned by `cardinal-diff`)
- No DB schema ownership (owned by `cardinal-store`)
- No UI rendering (owned by `client`)

## 3. Runtime Inputs

Environment:

- `PORT` (default `4000`)
- `DATA_ROOT` (default `~/.codex/sessions` when present)
- `CACHE_DB_PATH` (defaults to `~/.cardinal-diff/index/cardinaldiff.sqlite`, with legacy fallback)
- `CONVERSATION_BREAK_LIMIT` (default `10`)
- `JIRA_BASE_URL`
- `JIRA_AUTH_TOKEN` or (`JIRA_EMAIL` + `JIRA_API_TOKEN`)
- `JIRA_DEFAULT_ISSUE_TYPE` (default `Task`)
- `JIRA_PROJECTS_CACHE_TTL_MS` (default `300000`)
- `JIRA_ISSUES_CACHE_TTL_MS` (default `60000`)

## 4. Responsibilities

1. Expose session explorer endpoints (`/api/root`, `/years`, `/months`, `/days`, `/projects`, `/files`, `/file`).
2. Parse and filter JSONL content for preview-safe output.
3. Cache processed file data using stable hash + file metadata checks to avoid repeated work.
4. Expose CardinalDiff endpoints under `/api/cardinal/*`.
5. Expose Jira endpoints under `/api/jira/*` with cache/refresh semantics.
6. Enforce safe path resolution against traversal attempts.

## 5. Session Processing Contract

Parsing pipeline:

1. Read JSONL file once.
2. Extract:
   - `projectDir` from `session_meta.payload.cwd`
   - all valid timestamps
   - filtered preview lines
3. Exclude lines matching internal/system criteria:
   - `type`: `session_meta`, `event_msg`, `turn_context`
   - `response_item` payload types: `function_call`, `function_call_output`, `reasoning`
   - role `developer`
   - content containing both tag pairs:
     - `<INSTRUCTIONS>...</INSTRUCTIONS>`
     - `<environment_context>...</environment_context>`

Conversation segmentation:

- Segments are split on inactivity gaps greater than `conversation_break_limit` minutes.
- Files without timestamps use modified-time fallback for start/end.

Caching behavior:

- Cache key is file path.
- Reuse cached parse if size+mtime unchanged.
- If size/mtime changed but stable hash matches, update metadata and reuse parsed payload.
- `refresh=1` forces reprocessing.

## 6. Cardinal API Contract

Project endpoints:

- `GET /api/cardinal/projects`
- `POST /api/cardinal/projects`
- `DELETE /api/cardinal/projects/:projectId`
- `GET /api/cardinal/project-by-root?root_path=...`

Commit/diff/history endpoints:

- `GET /api/cardinal/commits`
- `GET /api/cardinal/commit/:commitId`
- `GET /api/cardinal/file-history`
- `GET /api/cardinal/diff`
- `GET /api/cardinal/events`

Health:

- `GET /api/cardinal/heartbeat`

## 7. Jira API Contract

Project/issue listing:

- `GET /api/jira/projects?refresh=0|1`
- `GET /api/jira/issues?project_key=...&refresh=0|1`

Issue actions:

- `GET /api/jira/issues/:issueKey/transitions`
- `POST /api/jira/issues/:issueKey/comment`
- `POST /api/jira/issues/:issueKey/status`
- `POST /api/jira/issues`

Cache behavior:

- List endpoints return cached data when fresh.
- `refresh=1` forces remote Jira sync and updates sqlite cache.
- On remote failures, stale cached data may be returned when available (with stale markers).

Validation rules:

- Required query/body fields MUST return `400` when missing/invalid.
- Missing entities return `404`.
- Paths for project creation MUST be absolute directories within current user home.
- Jira endpoints return `503` when Jira credentials are not configured.

## 8. Error Handling

- Route-level guards return explicit `400`/`404` responses.
- Global express error middleware returns structured `{ error: string }`.
- File parsing failures in session enumeration are isolated per file (best-effort list).

## 9. Security and Safety

- `resolveSafePath` MUST block traversal outside `DATA_ROOT`.
- No raw SQL in server package (all DB interaction via typed cache adapters).
- CORS and JSON parsing middleware enabled for local app consumption.

## 10. Performance Expectations

- Day-level browsing should avoid full file reparsing on repeated access.
- API operations are synchronous file/DB reads today; acceptable for local desktop usage.
- Query limits are bounded on cardinal endpoints to avoid excessive payloads.
- Jira reads should primarily hit sqlite cache and only sync remotely when stale/forced.

## 11. Test Requirements

Minimum required server tests:

- Happy path:
  - session parsing/filtering
  - segment construction
  - request helper parsing
- Error path:
  - traversal blocking
  - invalid query fallback behavior
- Edge cases:
  - empty timestamps
  - invalid json lines
  - missing directory reads
  - Jira cache freshness/fallback behavior

## 12. Change Management

When endpoint behavior changes, update all of:

- `server/README.md`
- `docs/specs/server.spec.md`
- Client consumers in `client/src`
