# Quality Score

Status: Verified
last-reviewed: 2026-06-11

## Scoring Scale

- 5: Excellent
- 4: Good
- 3: Adequate
- 2: At risk
- 1: Critical

## Domain And Layer Scores

| Area | Score | Evidence | Gap | Next Action |
| --- | ---: | --- | --- | --- |
| Workspace architecture | 5 | `scripts/architecture.ts` enforces allowed local imports. | None known. | Keep dependency changes in the architecture map. |
| Type safety | 5 | Strict TypeScript across workspaces. | Dynamic JSON still requires defensive parsing at boundaries. | Keep runtime guards in server/store utilities. |
| Server/API behavior | 4 | HTTP contract tests cover representative routes and security behavior. | Not every Jira/activity branch is contract-tested. | Add targeted tests when changing route families. |
| Client behavior | 4 | Utility and rendered behavior tests cover timeline, preview, display, date, and theme behavior. | More hook-level Jira/activity race tests would be useful. | Add tests around future hook changes. |
| Persistence | 4 | Shared SQLite schema and typed store APIs centralize ownership. | Store implementation remains dense. | Split only around real change pressure. |
| Observability | 4 | Shared wide-event logger with context and error normalization. | No central log viewer in repo. | Keep event names stable and documented in runtime code. |
| Documentation | 4 | Canonical docs map, specs, and docs check exist. | Semantic drift detection is limited. | Add high-confidence drift checks incrementally. |
| CI readiness | 4 | GitHub Actions workflow runs the full local gate. | CI depends on Bun and platform-neutral tests. | Keep macOS-only runtime behavior mocked or unit-scoped. |

## Current Quality Gate

```bash
bun run check
```

The gate includes lint, typecheck, tests, coverage, architecture, specs, and documentation checks.
