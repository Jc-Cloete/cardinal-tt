# cardinal-tt

Monorepo for exploring Codex session data and tracking local project filesystem changes with CardinalDiff.

## Architecture

- `client`: React + Vite UI for conversation exploration, timeline visualization, and CardinalDiff views.
- `server`: Express API for browsing session files, cache-backed parsing, and CardinalDiff API adapters.
- `cardinal-diff`: macOS background service + CLI that watches projects with FSEvents and writes immutable commits.
- `cardinal-activity`: macOS background service + CLI that records active-window events and periodic screenshots.
- `cardinal-store`: shared SQLite schema, types, and queries used by both `server` and `cardinal-diff`.
- `cardinal-observability`: shared structured wide-event logging package used across workspaces.
- `docs`: product/engineering specs.

Module documentation:

- `client/README.md`
- `server/README.md`
- `cardinal-diff/README.md`
- `cardinal-activity/README.md`
- `cardinal-store/README.md`
- `cardinal-observability/README.md`
- `docs/README.md`

Core specs:

- `docs/specs/cardinal_store.spec.md`
- `docs/specs/server.spec.md`
- `docs/specs/client.spec.md`
- `docs/specs/cardinal_diff.spec.md`
- `docs/specs/cardinal_activity.spec.md`

## Bun Workspace

This repo is a Bun workspace (`workspaces` in root `package.json`).

Install:

```bash
bun install
```

Run all services:

```bash
bun run dev
```

Run a single workspace:

```bash
bun run dev:server
bun run dev:client
bun run dev:diff
bun run dev:activity
```

Run strict type checks:

```bash
bun run typecheck
```

Run the full local quality gate:

```bash
bun run check
```

Run coverage visibility and threshold checks:

```bash
bun run test:coverage
```

Run workspace architecture boundary checks:

```bash
bun run architecture:check
```

Run spec-to-test enforcement:

```bash
bun run specs:check
```

Current coverage thresholds are enforced per workspace by `scripts/coverage.ts`:

- `server`: 85% functions, 85% lines
- `client`: 90% functions, 90% lines
- `cardinal-diff`: 70% functions, 70% lines
- `cardinal-store`: 90% functions, 90% lines
- `cardinal-activity`: 20% functions, 40% lines

Architecture boundaries are enforced by `scripts/architecture.ts`:

- `client` may import `cardinal-observability`.
- `server` may import `cardinal-observability` and `cardinal-store`.
- `cardinal-diff` may import `cardinal-observability` and `cardinal-store`.
- `cardinal-activity` may import `cardinal-observability` and `cardinal-store`.
- `cardinal-store` may import `cardinal-observability`.
- `cardinal-observability` may not import local workspaces.
- Relative imports may not cross from one workspace into another.

Spec IDs are enforced by `scripts/spec-enforcement.ts`:

- Requirements in `docs/specs/*.spec.md` use stable `SPEC-*` IDs.
- Tests reference covered requirements with `@spec SPEC-*` comments.
- `bun run specs:check` fails when a documented ID has no test reference, a test references an unknown ID, or a spec ID appears in more than one spec document.

## Runtime Data Paths

- Session source root: `~/.codex/sessions` by default, override with `DATA_ROOT`.
- Cardinal storage: `~/.cardinal-diff/index/cardinaldiff.sqlite` by default.
- Server cache DB path can be overridden with `CACHE_DB_PATH`.

## Environment

Common variables:

- `PORT` (server port, default `4000`)
- `HOST` (server bind host, default `127.0.0.1`)
- `DATA_ROOT` (session source root)
- `CACHE_DB_PATH` (sqlite path for cache/cardinal data)
- `CONVERSATION_BREAK_LIMIT` (minutes, default `10`)
- `JIRA_BASE_URL`, plus auth (`JIRA_AUTH_TOKEN` or `JIRA_EMAIL` + `JIRA_API_TOKEN`)
- `JIRA_PROJECTS_CACHE_TTL_MS`, `JIRA_ISSUES_CACHE_TTL_MS`

Security posture:

- The server is local-first and binds to loopback by default.
- Browser origins are limited to `localhost`, `127.0.0.1`, and `::1`; remote origins receive `403`.
- The detailed posture is documented in `docs/security.md`.

## Current Feature Set

- Browse sessions by year/month/day/project.
- Show cross-day conversations on each day timeline where they have message activity.
- Filtered message preview (developer + internal/system event filtering).
- Vertical timeline with idle-gap compression and overlap lanes.
- Conversation segments based on configurable inactivity breaks.
- CardinalDiff project tracking controls in preview modal.
- CardinalDiff heartbeat health indicator.
- Cardinal events page with date/time range filtering.
- Activity scrubber page for active-window + screenshot playback by day/time range.
- Jira workbench page (projects, tickets, comments, status transitions, ticket creation).
- Settings page for Jira defaults (default project, default status filters, default assignee filters).
- Searchable multi-select dropdowns for Jira status/assignee filtering.
- Global top-right toast notifications for user-triggered success/error/info/warning feedback.
- Force-refresh option to bypass cached session parsing.
- CardinalDiff scans that honor both `.cardinaldiffignore` and layered `.gitignore` rules.

Jira caching/filter options behavior:

- Server exposes `GET /api/jira/filter-options` that returns projects plus distinct status/assignee options.
- Filter options are sourced from cache when possible and hydrated from remote Jira when stale/empty/forced.
- Jira issue list loading in the client guards against stale in-flight responses when switching projects quickly.

## CardinalDiff Maintenance

List tracked projects:

```bash
cd cardinal-diff
bun run start projects list
```

Reprocess one tracked project (rebuilds index snapshot and clears stale history for that project):

```bash
cd cardinal-diff
bun run start projects reprocess <project_id>
```

If the agent is currently active and you intentionally want to reprocess anyway:

```bash
cd cardinal-diff
bun run start projects reprocess <project_id> --allow-active-agent
```
