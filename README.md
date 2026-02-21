# Fullstack Data Explorer

This scaffold creates a fullstack React app for exploring the file structure in a directory by:

- Year
- Month
- Day
- Project directory

Project directory values are extracted from each session file's `session_meta.payload.cwd` in the `.jsonl` data.

## Start

1. In the project root, install deps:

```bash
bun install
```

2. Run both services:

```bash
bun run dev
```

You can also run each workspace directly:

```bash
bun run dev:server
bun run dev:client
bun run dev:diff
```

Frontend runs at `http://localhost:5173`, API at `http://localhost:4000`.

## TypeScript

This project is fully TypeScript (`.ts`/`.tsx`) with strict mode enabled in both workspaces.

Run type checks:

```bash
bun run typecheck
```

## Cardinal Diff workspace

`cardinal-diff` is a separate Bun workspace in this monorepo that tracks local project file changes and writes immutable commit/event records into SQLite (`CACHE_DB_PATH`).

Default storage layout:

- `~/.cardinal-diff/config.json`
- `~/.cardinal-diff/projects/*.json`
- `~/.cardinal-diff/index/cardinaldiff.sqlite` (default when no legacy DB exists)
- `~/.cardinal-diff/objects/**` (Mode B content blobs)
- `~/.cardinal-diff/logs/*`

CLI examples:

```bash
cd cardinal-diff
bun run start projects list
bun run start projects add --path /Users/you/code/some-project --name some-project --mode metadata --hash-policy off
bun run start commits list --project <project_id> --limit 50
bun run start commit show <commit_id>
bun run start file history --project <project_id> --path src/index.ts
bun run start diff --project <project_id> --from <commit_id> --to <commit_id> --path src/index.ts
bun run start doctor --project <project_id>
bun run start agent run
```

LaunchAgent helpers:

```bash
cd cardinal-diff
bun run start agent install
bun run start agent uninstall
bun run agent:install
bun run agent:uninstall
```

## Configure data root

Default root is `~/.codex/sessions` when it exists.
Set `DATA_ROOT` before starting server to override it.

```bash
export DATA_ROOT=/path/to/data
export CONVERSATION_BREAK_LIMIT=10
```

## API endpoints

- `GET /api/root`
- `GET /api/years`
- `GET /api/months?year=YYYY`
- `GET /api/days?year=YYYY&month=MM`
- `GET /api/projects?year=YYYY&month=MM&day=DD`
- `GET /api/files?year=YYYY&month=MM&day=DD&project=DIR&conversation_break_limit=MINUTES`
- `GET /api/file?year=YYYY&month=MM&day=DD&file=FILENAME`
- `GET /api/cardinal/projects`
- `GET /api/cardinal/commits?project_id=<optional>&limit=100&since_ns=<optional>&until_ns=<optional>`
- `GET /api/cardinal/commit/:commitId`
- `GET /api/cardinal/file-history?project_id=<id>&rel_path=<path>&limit=200`
- `GET /api/cardinal/diff?project_id=<id>&from_commit_id=<id>&to_commit_id=<id>&rel_path=<optional>`

`/api/root` includes:
- `conversation_break_limit`: default minutes used by the backend when query override is absent

`project` supports:
- `_all` for all projects in that day
- `_unknown` when a session file has no `payload.cwd` metadata

`/api/file` preview output excludes:
- entries where `type === "session_meta"`
- entries where `type === "event_msg"`
- entries where `type === "turn_context"`
- entries where `type === "response_item"` and `payload.type` is `function_call`, `function_call_output`, or `reasoning`
- entries where role resolves to `developer`
- entries whose text contains either full tag pair:
  - `<INSTRUCTIONS>...</INSTRUCTIONS>`
  - `<environment_context>...</environment_context>`

`/api/files` returns per conversation:
- `startedAt`: earliest JSONL `timestamp` in the file
- `endedAt`: latest JSONL `timestamp` in the file
- `segments`: timestamp ranges split by `conversation_break_limit` inactivity gaps

Frontend behavior:
- Message preview cards are clamped to 3 lines by default with expand/collapse.
- Clicking a timeline item opens conversation preview in a separate modal.
- Timeline uses returned timestamp ranges and can span multiple days when conversation segments cross day boundaries.
- Timeline compresses long idle periods into section gaps (for example overnight inactivity), while keeping active periods expanded for readability.
- Idle-gap compression threshold is dynamic: `max(60 minutes, conversation_break_limit)`.
- Overlapping conversation segments are automatically laid out side by side in parallel lanes.
