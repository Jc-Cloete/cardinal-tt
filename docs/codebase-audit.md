# Codebase Audit

Status: Verified
last-reviewed: 2026-06-11

## Summary

`cardinal-tt` is a local-first TypeScript desktop tooling monorepo with clear workspace boundaries, shared persistence, spec-linked tests, and executable quality gates.

The current strongest signals are:

- Explicit Bun workspaces for UI, API, agents, store, and observability.
- Strict TypeScript across runtime workspaces.
- Shared SQLite ownership in `cardinal-store`.
- Shared structured logging through `cardinal-observability`.
- HTTP contract tests for representative server routes and local security behavior.
- Coverage thresholds through `scripts/coverage.ts`.
- Package boundary enforcement through `scripts/architecture.ts`.
- Spec-to-test enforcement through `scripts/spec-enforcement.ts`.
- Documentation structure/link enforcement through `scripts/docs-check.ts`.
- CI workflow prepared to run `bun install --frozen-lockfile` and `bun run check` on macOS.

Overall architectural rating: **A-**

Automated anti-drift rating: **A-**

## Evidence Table

| Claim | Evidence | Confidence |
| --- | --- | --- |
| The repo uses explicit Bun workspaces. | Root `package.json` workspaces. | High |
| Strict TypeScript is enabled across packages. | Workspace `tsconfig.json` files. | High |
| The local quality gate is executable from one command. | Root `bun run check`. | High |
| Coverage thresholds are enforced per workspace. | `scripts/coverage.ts`. | High |
| Workspace import boundaries are mechanically enforced. | `scripts/architecture.ts`, `scripts/__tests__/architecture.test.ts`. | High |
| Specs are tied to tests through stable requirement IDs. | `docs/specs/*.spec.md`, `scripts/spec-enforcement.ts`. | High |
| Server local-origin security is tested. | `server/src/security.ts`, `server/src/__tests__/security.test.ts`, `server/src/__tests__/api-contract.spec.ts`. | High |
| Shared persistence prevents writer/reader schema drift. | `cardinal-store/src/db.ts`, workspace imports from agents/server. | High |
| CI exists for the full quality gate on a macOS runner. | `.github/workflows/ci.yml`. | High |

## Strengths

### Package Boundaries

The workspace split matches runtime ownership:

- UI behavior lives in `client`.
- HTTP/API behavior lives in `server`.
- Background filesystem tracking lives in `cardinal-diff`.
- Activity tracking lives in `cardinal-activity`.
- SQLite schema and queries live in `cardinal-store`.
- Logging lives in `cardinal-observability`.

The architecture check keeps those boundaries from becoming convention-only.

### Local Security

The server binds to loopback by default and rejects non-local browser origins. File-serving routes validate resolved paths against configured data roots before returning content.

### Test And Spec Discipline

Specs under `docs/specs` use stable IDs, and tests map to those IDs. This gives reviewers a direct path from documented behavior to executable coverage.

### Operational Fit

The system is honest about being local desktop tooling. It uses SQLite, FSEvents, LaunchAgents, macOS permissions, and loopback APIs instead of pretending to be a hosted SaaS architecture.

## Remaining Gaps

| Priority | Gap | Next Action |
| --- | --- | --- |
| P1 | Activity coverage thresholds are intentionally lower than other workspaces. | Add more agent/CLI behavior tests before raising the threshold. |
| P2 | Some modules remain large because they own dense orchestration paths. | Split only when a feature or fix gives a natural boundary. |
| P2 | Jira behavior still depends on upstream availability and optional credentials. | Keep cache fallback behavior covered and avoid requiring Jira for local test success. |
| P3 | Docs drift checks are structural today, not semantic. | Add targeted drift checks only for high-confidence invariants. |

## Verification Commands

```bash
bun run check
bun run docs:check
```
