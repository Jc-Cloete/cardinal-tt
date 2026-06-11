# Architecture

Status: Verified
last-reviewed: 2026-06-11

## System Overview

`cardinal-tt` is a Bun workspace monorepo for local developer telemetry and workflow review. It combines:

- a browser UI for inspecting session timelines and operational data,
- a loopback-only API server,
- macOS background agents for filesystem and activity capture,
- a shared SQLite persistence layer,
- shared structured logging,
- executable checks for type safety, tests, coverage, package boundaries, specs, and docs.

The system is local-first. It is not designed as a hosted multi-user service.

## Domain Boundaries

| Domain | Owner | Notes |
| --- | --- | --- |
| Session exploration | `server`, `client` | Server reads JSONL from `DATA_ROOT`; client renders filters, timelines, and previews. |
| Filesystem change ledger | `cardinal-diff`, `cardinal-store`, `server`, `client` | Agent writes immutable commits; server adapts store records; client renders status, events, and diffs. |
| Activity playback | `cardinal-activity`, `cardinal-store`, `server`, `client` | Agent writes window/screenshot records; server validates screenshot file access; client scrubs by day/time. |
| Jira workflow cache | `server`, `cardinal-store`, `client` | Server owns remote Jira calls and cache policy; client owns workflow UI and persisted defaults. |
| Observability | `cardinal-observability` | Shared wide-event logger used by runtime workspaces. |

## Package And Layering Rules

Allowed local dependencies are enforced by `scripts/architecture.ts`:

| Importer | Allowed local workspace imports |
| --- | --- |
| `client` | `cardinal-observability` |
| `server` | `cardinal-observability`, `cardinal-store` |
| `cardinal-diff` | `cardinal-observability`, `cardinal-store` |
| `cardinal-activity` | `cardinal-observability`, `cardinal-store` |
| `cardinal-store` | `cardinal-observability` |
| `cardinal-observability` | none |

Relative imports may not cross from one workspace into another.

## Runtime Entry Points

- Root dev orchestration: `bun run dev`
- Server: `server/index.ts`, `server/src/app.ts`
- Client: `client/src/main.tsx`, `client/src/App.tsx`
- CardinalDiff CLI/agent: `cardinal-diff/src/cli.ts`, `cardinal-diff/src/agent.ts`
- Activity CLI/agent: `cardinal-activity/src/cli.ts`, `cardinal-activity/src/agent.ts`
- Store API: `cardinal-store/src/index.ts`
- Observability API: `cardinal-observability/src/index.ts`

## Data Model And Persistence Boundaries

`cardinal-store` owns SQLite schema creation, additive migrations, typed row parsing, transactions, and public persistence APIs for:

- CardinalDiff projects, index snapshots, commits, changed entries, events, and heartbeats.
- Jira project/issue caches, sync timestamps, status options, and assignee options.
- Activity window events, screenshot assets, screenshot frames, and heartbeats.

`server` consumes the store through adapters and must not issue raw SQL. Agents write through shared store APIs so readers and writers do not drift.

## Cross-Cutting Concerns

- Security: `server/src/security.ts` enforces local browser origins; file-serving paths are resolved against configured roots.
- Runtime validation: `server/src/utils/validation.ts` centralizes query, body, and route parameter parsing.
- Observability: runtime packages use `cardinal-observability` for structured events.
- Specs: `docs/specs/*.spec.md` declares stable `SPEC-*` IDs, and tests reference covered behavior with `@spec`.
- Quality gates: root `bun run check` runs lint, typecheck, tests, coverage, architecture, spec, and docs checks.

## Known Constraints And Risks

- The project depends on macOS-specific capabilities for FSEvents, LaunchAgents, active-window metadata, and screenshots.
- Activity capture requires explicit macOS Accessibility and Screen Recording permissions.
- Jira behavior depends on optional runtime credentials and upstream API availability.
- The codebase is local-first; exposing the API beyond loopback requires additional authentication, TLS, and network policy.
- Some high-value modules remain large and should be split only when an adjacent feature or fix needs the boundary.
