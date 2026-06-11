# AGENTS

## Purpose

This file is the quick map for contributors and coding agents. Keep detailed behavior, rationale, and standards in `docs/` so this stays short and stable.

## Quick Navigation

- Project overview: [README.md](README.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Documentation index: [docs/README.md](docs/README.md)
- Product specs: [docs/product-specs/index.md](docs/product-specs/index.md)
- Design rationale: [docs/design-docs/index.md](docs/design-docs/index.md)
- Quality assessment: [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md)
- Reliability standards: [docs/RELIABILITY.md](docs/RELIABILITY.md)
- Security posture: [docs/SECURITY.md](docs/SECURITY.md)
- Active plans: [docs/exec-plans/active/](docs/exec-plans/active/)
- Completed plans: [docs/exec-plans/completed/](docs/exec-plans/completed/)
- Technical debt tracker: [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md)

## Workspace Map

| Workspace | Role |
| --- | --- |
| `client` | React/Vite UI for explorer, activity, CardinalDiff, Jira, settings, and toasts. |
| `server` | Express API, session parsing, local security middleware, cache adapters, Jira orchestration. |
| `cardinal-diff` | macOS FSEvents watcher, CLI, project change ledger, object store and diffing. |
| `cardinal-activity` | macOS active-window and screenshot tracking agent. |
| `cardinal-store` | Shared SQLite schema, migrations, typed queries, repair routines. |
| `cardinal-observability` | Shared structured wide-event logger. |

## Working Rules

- Treat `docs/` as the source of truth for behavior, quality, reliability, and security.
- Update specs before or with behavior changes; tests reference spec IDs with `@spec`.
- Keep workspace boundaries intact. Run `bun run architecture:check` after import changes.
- Keep runtime secrets in local ignored files only. Never commit `.env`, SQLite DBs, screenshots, caches, or local session data.
- Use relative repository paths in documentation. Do not add machine-specific absolute paths.
- Before handing off, run `bun run check` or document exactly which sub-check could not run.

## Common Commands

```bash
bun install
bun run dev
bun run check
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run docs:check
```
