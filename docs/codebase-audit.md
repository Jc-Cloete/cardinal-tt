# Codebase Audit: Modularity, Architecture, Robustness, and Automated Guardrails

Date: 2026-04-24  
Repository: `.`  
Auditor: Codex  
Scope: Full repository audit of source structure, package boundaries, automated checks, representative implementation paths, and documentation/spec alignment.

## Executive Summary

This codebase is already in a better-than-average state for a local TypeScript desktop tooling monorepo. The strongest signals are:

- Clear workspace boundaries: `client`, `server`, `cardinal-diff`, `cardinal-activity`, `cardinal-store`, and `cardinal-observability`.
- Strict TypeScript across all workspaces.
- Centralized persistence in `cardinal-store`, which reduces schema drift between server and agents.
- Shared structured logging through `cardinal-observability`.
- A root `bun run check` gate that runs Biome, workspace typechecks, and tests.
- Meaningful unit coverage for parser utilities, timeline logic, scanner/change detection, store persistence, Jira cache behavior, and activity storage.

The primary concern is not that the repository is sloppy. It is that the current guardrails are mostly local and convention-driven. There is no repository CI workflow, no coverage threshold, no architectural boundary checker, no route/API contract tests, and several critical modules are growing into large multi-responsibility files. Those gaps make it possible for future changes to erode the good architecture without immediate mechanical failure.

Overall architectural rating: **B+**

Automated anti-slop rating: **B-**

The code is modular at the package level, but it needs stronger automated enforcement to keep it modular as features accumulate.

## Verification Performed

The full local quality gate passes.

```bash
bun run check
```

Result:

- `biome check . --error-on-warnings`: passed.
- TypeScript `tsc --noEmit` for `server`, `client`, `cardinal-diff`, `cardinal-store`, and `cardinal-activity`: passed.
- Test suites: passed.
  - `server`: 15 tests.
  - `client`: 12 tests.
  - `cardinal-diff`: 16 tests.
  - `cardinal-store`: 7 tests.
  - `cardinal-activity`: 2 tests.

Repository state note: the worktree already had many modified and untracked files before this report was added. This audit intentionally adds only this report and does not normalize or revert existing work.

## Architecture Snapshot

The repository is a Bun workspace monorepo:

- `client`: React + Vite UI.
- `server`: Express API layer.
- `cardinal-diff`: macOS FSEvents project watcher and file-change ledger.
- `cardinal-activity`: macOS active-window and screenshot tracker.
- `cardinal-store`: shared SQLite schema and persistence API.
- `cardinal-observability`: shared wide-event logging.
- `docs/specs`: package-level product and engineering contracts.

The package split is sound. The most important architectural decision is the shared store package. `cardinal-store` owns the SQLite schema and query/mutation API, while `server`, `cardinal-diff`, and `cardinal-activity` consume it. That is the right direction for extensibility because it prevents each runtime from inventing its own schema adapter.

## Evidence Table

| Claim | Evidence | Confidence |
| --- | --- | --- |
| The repo uses explicit Bun workspaces. | Root `package.json` defines six workspaces. | High |
| Strict TypeScript is enabled across packages. | Each workspace `tsconfig.json` has `"strict": true`. | High |
| Formatting and linting are strict. | `biome.jsonc` enables recommended, nursery, security, performance, correctness, style, suspicious, complexity, and a11y rule groups with `--error-on-warnings`. | High |
| The local quality gate is real and currently green. | `bun run check` passed Biome, all typechecks, and all tests. | High |
| There is no repo-owned CI workflow. | No `.github/` directory exists outside `node_modules`. | High |
| Store schema ownership is centralized. | `cardinal-store/src/db.ts` creates schema, migrations, prepared statements, and store API. | High |
| Store mutation groups use transactions where needed. | `writeCommit`, `setProjectIndexSnapshot`, `reprocessProject`, and Jira replace operations use `db.transaction`. | High |
| Server routing is becoming a large responsibility concentration. | `server/src/routes/api.ts` is ~802 lines and owns route definitions, validation, instrumentation, Jira, activity, CardinalDiff, and session endpoints. | High |
| Store implementation is a large responsibility concentration. | `cardinal-store/src/db.ts` is ~1847 lines and owns schema, migrations, statements, type conversion, and public API. | High |
| There are unit tests but no route/API integration tests. | Tests cover utilities/services/store/scanner, but no test imports `createApp` or exercises HTTP endpoints. | High |
| Frontend hooks are useful but becoming application services. | `useConversationExplorer.ts` is ~566 lines and `useJira.ts` is ~455 lines, mixing fetch orchestration, selection state, logging, and toast effects. | High |

## Strengths

### 1. Good Package-Level Modularity

The workspace split maps to clear runtime responsibilities. `client`, `server`, `cardinal-diff`, `cardinal-activity`, `cardinal-store`, and `cardinal-observability` are sensible boundaries.

This enables independent evolution of:

- UI workflows.
- API composition.
- File watcher behavior.
- Activity capture behavior.
- Shared persistence.
- Cross-cutting logging.

The current dependency direction is also mostly healthy: runtimes depend on `cardinal-store` and `cardinal-observability`; the shared store does not depend on the application runtimes.

### 2. Strong Type Discipline

All workspaces use strict TypeScript. A scan for `any`, `@ts-ignore`, `@ts-expect-error`, and `biome-ignore` in source files found no matches. Dynamic data from SQLite and JSON is mostly contained behind local conversion helpers rather than leaking unsafely through public models.

This is a strong baseline for maintainability.

### 3. Solid Persistence Design

`cardinal-store` centralizes:

- Schema creation.
- WAL mode.
- Foreign keys.
- Busy timeout.
- Prepared statements.
- Additive migration helper.
- Transactional writes for commit/index changes.
- Jira cache replacement transactions.
- Activity screenshot/window storage.

This is exactly the kind of shared boundary that prevents divergence between the local agents and the API server.

### 4. Observable Runtime Behavior

The repository has a shared wide-event logger, route instrumentation, store instrumentation, and agent/service logging. That is valuable for local desktop tooling because many failures are environmental: permissions, filesystem state, watcher behavior, Jira credentials, and cache freshness.

### 5. Specs Exist and Are Useful

`docs/specs` documents package contracts for client, server, store, CardinalDiff, and activity tracking. The specs are not just prose; they list responsibilities, non-goals, behavioral contracts, and minimum test requirements.

That gives the project a good foundation for anti-drift automation.

## Priority Findings

### P1. No CI Enforces the Local Quality Gate

The root `check` script is good, and it currently passes, but it appears to be local-only. There is no repository `.github/workflows` directory.

Risk:

- A future branch can skip `bun run check`.
- The strict local standards are not enforced on pull requests.
- "Works on my machine" becomes the quality boundary.

Recommendation:

Add a CI workflow that runs on pull requests and pushes:

1. `bun install --frozen-lockfile`
2. `bun run check`
3. Optional: upload test/coverage output once coverage is added.

This is the highest-value anti-slop fix because it turns existing standards into a hard gate.

### P1. No Coverage Thresholds or Coverage Visibility

There is no coverage command, no coverage threshold, and no report artifact. The current tests are useful, but there is no mechanical guarantee that critical paths stay covered.

Risk:

- Large new features can land with token tests or no meaningful tests.
- Important behavior in routes, agents, hooks, and migrations can regress silently.
- Test quantity can look healthy while risk coverage decays.

Recommendation:

Add coverage collection with thresholds, starting conservatively:

- Global lines/functions threshold: 70%.
- Critical package threshold for `cardinal-store`, `server/domain`, `server/utils`, `cardinal-diff/scanner`, and `cardinal-diff/change-detector`: 80%.
- Exclude UI presentation components initially if needed, but include hooks and pure utilities.

Raise thresholds over time as route and hook coverage improves.

### P1. No HTTP/API Contract Tests

`server/src/app.ts` exposes `createApp`, which is testable, but the test suite does not exercise the Express API surface. Current server tests cover parser/service/path utilities, not endpoint behavior.

Risk:

- Route validation can drift from specs without failing tests.
- Response shapes can change and break the client.
- Error-status expectations for Jira/Cardinal/activity/session routes are not protected.
- Screenshot file-serving safety depends on route-level behavior and should be tested end-to-end.

Recommendation:

Add route-level tests against `createApp` using Bun-compatible request handling or a small local HTTP server in tests. Cover:

- `GET /api/root`
- `GET /api/months`, `/days`, `/projects`, `/files`, `/file`
- traversal rejection and missing file behavior
- `GET /api/activity/window-events` invalid/valid ranges
- `GET /api/activity/screenshots/:assetId` path containment
- Jira `503` when unconfigured
- Cardinal project creation validation

This is the largest functional testing gap.

### P1. Missing Architectural Boundary Enforcement

The codebase is modular by convention, but no tool currently prevents boundary violations. For example, there is no check that:

- `client` never imports from `server`, `cardinal-diff`, or `cardinal-store` directly.
- `cardinal-store` remains free of runtime-specific server/agent imports.
- `server` does not reach into agent internals.
- shared packages stay dependency-light.

Risk:

- New features can introduce convenient cross-package imports that weaken boundaries.
- The monorepo can gradually become a tangle despite good initial structure.

Recommendation:

Add dependency boundary checks with a tool such as `dependency-cruiser`, `madge`, or a custom script using TypeScript module resolution. Enforce:

- No circular dependencies.
- `client` may depend on `cardinal-observability` only among local workspaces.
- `server` may depend on `cardinal-store` and `cardinal-observability`.
- `cardinal-diff` and `cardinal-activity` may depend on `cardinal-store` and `cardinal-observability`.
- `cardinal-store` may depend on `cardinal-observability` only.
- `cardinal-observability` may not depend on local workspaces.

Run it from `bun run check`.

### P2. Large Multi-Responsibility Modules Are Emerging

Several files are already large enough to slow review and invite mixed responsibilities:

- `cardinal-store/src/db.ts`: ~1847 lines.
- `server/src/routes/api.ts`: ~802 lines.
- `cardinal-diff/src/service.ts`: ~704 lines.
- `cardinal-diff/src/agent.ts`: ~654 lines.
- `client/src/hooks/useConversationExplorer.ts`: ~566 lines.
- `server/src/integrations/jira-client.ts`: ~483 lines.
- `client/src/features/jira/JiraPage.tsx`: ~460 lines.
- `client/src/features/jira/useJira.ts`: ~455 lines.

Risk:

- Reviewers have to reason about unrelated concerns together.
- Tests become coarser because internal seams are hard to access.
- Future changes are more likely to create accidental coupling.

Recommendation:

Refactor incrementally by responsibility, not by arbitrary line count:

- Split `server/src/routes/api.ts` into routers:
  - `routes/session-routes.ts`
  - `routes/activity-routes.ts`
  - `routes/jira-routes.ts`
  - `routes/cardinal-routes.ts`
  - shared `route-instrumentation.ts`
- Split `cardinal-store/src/db.ts` into:
  - `schema.ts`
  - `migrations.ts`
  - `row-mappers.ts`
  - `statements.ts` or domain-specific repositories
  - `store.ts`
- Split frontend hooks into pure state reducers/selectors plus effectful API orchestration.

Add a file-size or complexity budget after the first split so the problem does not return.

### P2. Runtime Input Validation Is Manual and Repeated

Server request validation currently uses local string/number parsing in route handlers. This is serviceable, but it duplicates patterns and does not produce reusable request/response contracts.

Risk:

- Validation behavior diverges across endpoints.
- Client and server types can drift.
- Tests must discover invalid cases manually instead of validating schemas.

Recommendation:

Introduce schema validation for API inputs and outputs. Good options:

- `zod`
- `valibot`
- `@sinclair/typebox`

Start with server request schemas for:

- activity range queries
- Cardinal project creation
- Cardinal commit/diff queries
- Jira issue creation/status/comment bodies

Then export inferred client-side types or generate a small OpenAPI document from the schemas.

### P2. Specs Are Not Mechanically Enforced

The specs under `docs/specs` are valuable, but they are not checked. Some specs already contain "minimum required tests" that are not fully met. For example:

- `server.spec.md` requires Jira cache freshness/fallback behavior and activity range/screenshot safety checks; current server tests do not cover API route behavior.
- `client.spec.md` requires Jira selection fallback, default filter behavior, and stale response suppression tests; current client tests cover utility functions but not `useJira` behavior.

Risk:

- Specs can become aspirational rather than binding.
- New code can comply with tests but violate documented behavior.

Recommendation:

Add a lightweight docs/spec enforcement script:

- Verify every workspace README and spec exists.
- Verify every spec has `Status`, `Scope`, `Responsibilities`, `Test Requirements`, and `Change Management`.
- Optionally map requirement IDs to tests using tags in test names.

Add this to `bun run check` once stable.

### P2. Frontend Behavior Tests Are Too Utility-Heavy

Client tests currently cover date, preview parsing, timeline generation, and display utilities. Those are useful. The higher-risk behavior now lives in hooks and feature flows:

- request race handling in `useJira`
- default filters in settings/Jira
- `useConversationExplorer` cascading selector state
- activity scrubber selection and range behavior
- Cardinal add/remove tracking actions

Risk:

- UI state regressions can pass all tests.
- Race-condition fixes can be accidentally removed.

Recommendation:

Add React hook/component tests for:

- `useJira` stale issue response suppression.
- project/issue fallback behavior.
- default settings filters applied after issue load.
- explorer selection cascade when year/month/day changes.
- activity frame selection after range changes.

### P2. Store Schema Migrations Are Additive Only

The store uses `CREATE TABLE IF NOT EXISTS` and `addColumnIfMissing`, which is pragmatic for local tooling. However, there is no explicit schema version table, migration list, or migration test against older DB shapes.

Risk:

- Non-additive changes will be risky.
- Index changes and data backfills may be hard to reason about.
- Regression tests may only validate fresh databases, not upgraded ones.

Recommendation:

Add:

- `schema_version` table.
- named migrations.
- tests that create an older minimal DB shape and verify upgrade behavior.

This does not need a heavy migration framework; a small ordered migration runner is enough.

### P2. Security Posture Is Good Locally but Under-Specified

Positive signals:

- Path traversal is blocked for session paths.
- Activity screenshots are served only if resolved inside the activity data root.
- Cardinal project paths are constrained to the user's home directory.
- SQL access uses prepared statements.
- Jira credentials are held server-side.

Gaps:

- Express uses unrestricted `cors()`.
- `express.json()` has no explicit body size limit.
- There is no auth boundary, which is acceptable for local desktop tooling only if documented as local-only.
- No dependency audit command is part of the gate.

Recommendation:

Document the server as local-only and enforce that assumption:

- Bind to loopback by default.
- Configure CORS origin for the Vite client in development.
- Set an explicit JSON body limit.
- Add `bun audit` or equivalent dependency audit once it is reliable for the stack.

### P3. Root `lint` Does Redundant Work

The root `lint` script runs `bun run biome:check` and then each workspace runs `biome check <workspace>`. Since the root Biome check already covers the repository, this duplicates lint time.

Risk:

- Not a correctness issue today, but it adds friction as the repo grows.

Recommendation:

Keep `biome:check` as the single formatting/lint gate and reserve workspace `lint` scripts for package-specific linting only if needed.

### P3. Some Reusable Utilities Are Duplicated

Small helpers such as `toPosixPath` appear in several packages. Duplication is acceptable at this size, but it is a sign to watch.

Risk:

- Path normalization edge cases may be fixed in one package and missed in another.

Recommendation:

Do not prematurely create a broad `utils` package. Instead, extract only if the same helper gets non-trivial behavior or tests in more than two packages.

## Automated Checks and Balances: Current vs Recommended

| Area | Current | Gap | Recommendation |
| --- | --- | --- | --- |
| Formatting/linting | Biome strict, warnings fail | Not enforced in CI | Add GitHub Actions workflow |
| Type checking | Strict TS per workspace | Not enforced in CI | Add to CI via `bun run check` |
| Unit tests | Present and passing | No coverage threshold | Add coverage and thresholds |
| API contract tests | Minimal/no route tests | High route regression risk | Test `createApp` endpoints |
| Architecture boundaries | Convention only | No import/cycle enforcement | Add dependency boundary checker |
| Docs/spec drift | Specs exist | Not mechanically checked | Add docs/spec validation script |
| Schema migrations | Additive helper | No versioned migration tests | Add schema version + old DB tests |
| Security checks | Biome security rules | No dependency audit/body/CORS gate | Add local-only hardening and audit |
| File complexity | No budget | Large files emerging | Add max-lines/complexity budget after refactor |

## Suggested Anti-Slop Gate

The target gate should be:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run architecture:check
bun run docs:check
```

Then make root `check` run all of them:

```bash
bun run lint && bun run typecheck && bun run test && bun run test:coverage && bun run architecture:check && bun run docs:check
```

Recommended near-term scripts:

- `ci`: install-safe wrapper for CI.
- `coverage`: Bun coverage command or an adopted runner that can enforce thresholds.
- `architecture:check`: dependency boundary/cycle check.
- `docs:check`: required docs/spec metadata and link validation.
- `test:api`: Express API route tests.

## Recommended Roadmap

### Phase 1: Make Existing Quality Non-Optional

1. Add GitHub Actions CI running `bun install --frozen-lockfile` and `bun run check`.
2. Add route tests for the highest-risk server endpoints.
3. Add coverage reporting without failing thresholds initially.
4. Add coverage thresholds after the first baseline report.

### Phase 2: Enforce Architecture

1. Add dependency boundary/cycle checking.
2. Split `server/src/routes/api.ts` by route family.
3. Split `cardinal-store/src/db.ts` by schema/mappers/store responsibilities.
4. Add file-size/complexity budgets once the worst hotspots are split.

### Phase 3: Contract and Drift Prevention

1. Add schema validation for route inputs and optionally outputs.
2. Add docs/spec validation.
3. Add versioned DB migration tests.
4. Add hook/component tests for frontend orchestration behavior.

## Final Assessment

The project has a good architectural foundation and already avoids several common TypeScript monorepo failure modes. The package split is coherent, public contracts are typed, the shared store is a strong choice, and the local check command passes.

The main improvement is to move from "disciplined codebase" to "mechanically protected codebase." CI, coverage thresholds, API contract tests, dependency boundary checks, and docs/spec validation would make the current standards enforceable and prevent future entropy.

If this codebase keeps growing without those checks, the likely failure mode is not one obvious bad abstraction. It is gradual concentration of responsibility in route, store, agent, and hook files until changes become hard to review and regressions become harder to catch. The recommended roadmap is designed to stop that early while preserving the architecture that is already working.
