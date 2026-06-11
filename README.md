# cardinal-tt

`cardinal-tt` is a local-first TypeScript monorepo for inspecting Codex session history, tracking project filesystem changes, recording desktop activity context, and connecting that timeline to Jira work.

The project is intentionally built as more than a prototype UI. It demonstrates a full local tooling stack: a React/Vite client, an Express API, macOS background agents, shared SQLite persistence, structured observability, spec-linked tests, coverage thresholds, architecture boundary checks, and CI-ready quality gates.

## What It Does

- Browses Codex session JSONL files by year, month, day, project, and conversation.
- Renders conversations on a compressed vertical timeline with overlap lanes and cross-day segments.
- Shows filtered message previews that remove internal/system records from the readable transcript.
- Tracks configured project folders with CardinalDiff, a macOS FSEvents-backed change ledger.
- Records active-window events and screenshot frames for local activity playback.
- Provides a Jira workbench for projects, issues, comments, transitions, issue creation, and default filters.
- Stores CardinalDiff, activity, and Jira cache state in one shared SQLite-backed persistence package.

## Why The Architecture Matters

The codebase is split into small workspaces with explicit ownership:

| Workspace | Responsibility |
| --- | --- |
| `client` | React + Vite UI for explorer, activity, CardinalDiff, Jira, settings, and notifications. |
| `server` | Express API for session parsing, cache-backed reads, CardinalDiff adapters, activity APIs, and Jira workflows. |
| `cardinal-diff` | macOS background service and CLI for filesystem change tracking. |
| `cardinal-activity` | macOS activity tracker for active-window events and screenshot frame capture. |
| `cardinal-store` | Shared SQLite schema, migrations, typed queries, and repair routines. |
| `cardinal-observability` | Shared structured wide-event logging. |

The package boundaries are mechanically enforced by `scripts/architecture.ts`; relative imports cannot cross workspace boundaries, and only declared local package dependencies are allowed.

## Quality Model

The repository uses a single local quality gate:

```bash
bun run check
```

That command runs:

- Biome formatting/linting with warnings treated as errors.
- Strict TypeScript checks for each workspace.
- Unit and behavior tests across server, client, agents, store, and scripts.
- Coverage threshold checks via `scripts/coverage.ts`.
- Workspace architecture boundary checks via `scripts/architecture.ts`.
- Spec-to-test coverage checks via `scripts/spec-enforcement.ts`.
- Documentation structure and Markdown link checks via `scripts/docs-check.ts`.

Coverage thresholds are currently:

| Workspace | Function Coverage | Line Coverage |
| --- | ---: | ---: |
| `server` | 85% | 85% |
| `client` | 90% | 90% |
| `cardinal-diff` | 70% | 70% |
| `cardinal-store` | 90% | 90% |
| `cardinal-activity` | 20% | 40% |

## Run Locally

Install dependencies:

```bash
bun install
```

Run all development services:

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

Useful checks:

```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run architecture:check
bun run specs:check
bun run docs:check
```

## Runtime Data And Privacy

This is local desktop tooling. The server binds to loopback by default and rejects non-local browser origins before route handling.

Default local data locations:

- Session source root: `~/.codex/sessions`, override with `DATA_ROOT`.
- CardinalDiff storage: `~/.cardinal-diff/index/cardinaldiff.sqlite`.
- Activity screenshot storage: `~/.cardinal-activity`, override with `CARDINAL_ACTIVITY_DATA_DIR`.
- Server cache DB path: override with `CACHE_DB_PATH`.

Optional Jira integration uses environment variables:

- `JIRA_BASE_URL`
- `JIRA_AUTH_TOKEN`, or `JIRA_EMAIL` + `JIRA_API_TOKEN`
- `JIRA_PROJECTS_CACHE_TTL_MS`
- `JIRA_ISSUES_CACHE_TTL_MS`

Do not commit `.env` files or local SQLite/cache files. See [docs/SECURITY.md](docs/SECURITY.md) for the security posture.

## Documentation Map

- [AGENTS.md](AGENTS.md): quick navigation and contributor/agent working rules.
- [ARCHITECTURE.md](ARCHITECTURE.md): system boundaries, runtime entrypoints, and package layering.
- [docs/README.md](docs/README.md): documentation index.
- [docs/product-specs/index.md](docs/product-specs/index.md): product and behavior specs.
- [docs/design-docs/index.md](docs/design-docs/index.md): design rationale and operating principles.
- [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md): current quality assessment and gaps.
- [docs/RELIABILITY.md](docs/RELIABILITY.md): reliability model and operational assumptions.
- [docs/SECURITY.md](docs/SECURITY.md): local-only security posture and publish-safety expectations.

Workspace READMEs:

- [client/README.md](client/README.md)
- [server/README.md](server/README.md)
- [cardinal-diff/README.md](cardinal-diff/README.md)
- [cardinal-activity/README.md](cardinal-activity/README.md)
- [cardinal-store/README.md](cardinal-store/README.md)
- [cardinal-observability/README.md](cardinal-observability/README.md)

## CardinalDiff Maintenance

List tracked projects:

```bash
cd cardinal-diff
bun run start projects list
```

Reprocess one tracked project:

```bash
cd cardinal-diff
bun run start projects reprocess <project_id>
```

If the agent is active and you intentionally want to reprocess anyway:

```bash
cd cardinal-diff
bun run start projects reprocess <project_id> --allow-active-agent
```
