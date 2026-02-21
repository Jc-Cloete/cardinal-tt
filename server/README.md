# server

Express API workspace for:

- Browsing Codex session data from `DATA_ROOT`.
- Parsing/filtering JSONL conversations with cache-backed processing.
- Exposing CardinalDiff project/commit/diff/event/heartbeat endpoints.
- Exposing Jira project/issue workflows with sqlite-backed cache + sync.

## Scripts

```bash
bun run dev
bun run start
bun run typecheck
```

## Environment

- `PORT` (default `4000`)
- `DATA_ROOT` (default `~/.codex/sessions` when present)
- `CACHE_DB_PATH` (sqlite path used by shared cardinal store + session cache)
- `CONVERSATION_BREAK_LIMIT` (default `10`)
- `JIRA_BASE_URL` (example: `https://your-org.atlassian.net`)
- `JIRA_AUTH_TOKEN` (preferred bearer auth) OR:
  - `JIRA_EMAIL`
  - `JIRA_API_TOKEN`
- `JIRA_DEFAULT_ISSUE_TYPE` (default `Task`)
- `JIRA_PROJECTS_CACHE_TTL_MS` (default `300000`)
- `JIRA_ISSUES_CACHE_TTL_MS` (default `60000`)

## Source Layout

- `src/app.ts`: app/middleware bootstrapping.
- `src/routes/api.ts`: HTTP routes and request validation.
- `src/services/session-service.ts`: session listing + preview retrieval with cache-aware parsing.
- `src/domain/session-parser.ts`: JSONL parsing, filtering, timestamp extraction, segment construction.
- `src/cache/session-cache.ts`: sqlite cache for processed session files.
- `src/cache/cardinal-diff.ts`: adapters from shared Cardinal store types to API responses.
- `src/cache/jira.ts`: Jira cache orchestration (freshness checks, fallback policy, sync writes).
- `src/integrations/jira-client.ts`: typed Jira REST client.
- `src/utils/*`: path safety, hashing, JSON guards, query parsing.
- `src/types.ts`: strict shared server-side DTOs.

## API Groups

Session explorer:

- `GET /api/root`
- `GET /api/years`
- `GET /api/months?year=...`
- `GET /api/days?year=...&month=...`
- `GET /api/projects?year=...&month=...&day=...`
- `GET /api/files?year=...&month=...&day=...&project=...&conversation_break_limit=...`
- `GET /api/file?year=...&month=...&day=...&file=...`

CardinalDiff:

- `GET /api/cardinal/projects`
- `POST /api/cardinal/projects`
- `DELETE /api/cardinal/projects/:projectId`
- `GET /api/cardinal/project-by-root?root_path=...`
- `GET /api/cardinal/commits?...`
- `GET /api/cardinal/commit/:commitId`
- `GET /api/cardinal/file-history?...`
- `GET /api/cardinal/diff?...`
- `GET /api/cardinal/events?...`
- `GET /api/cardinal/heartbeat`

Jira:

- `GET /api/jira/projects?refresh=0|1`
- `GET /api/jira/issues?project_key=...&refresh=0|1`
- `GET /api/jira/issues/:issueKey/transitions`
- `POST /api/jira/issues/:issueKey/comment`
- `POST /api/jira/issues/:issueKey/status`
- `POST /api/jira/issues`
