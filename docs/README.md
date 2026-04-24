# docs

Project specifications and design artifacts.

## Contents

- `docs/specs/cardinal_store.spec.md`
  - Source-of-truth spec for the shared DB/schema/query layer used by server + cardinal-diff.
- `docs/specs/server.spec.md`
  - Source-of-truth spec for API behavior, session parsing/filtering, and cardinal adapters.
- `docs/specs/client.spec.md`
  - Source-of-truth spec for frontend UX/state/timeline behavior and cardinal integrations.
- `docs/specs/cardinal_diff.spec.md`
  - Production-target spec for CardinalDiff watcher/storage/CLI behavior.
- `docs/specs/cardinal_activity.spec.md`
  - Source-of-truth spec for window/screenshot activity tracking service behavior.
- `docs/security.md`
  - Security posture for local-only server exposure, file/path boundaries, and mechanical enforcement.

## Usage

When implementing features, treat specs here as product requirements and use workspace READMEs for implementation details.

## Quality Gates

Local quality checks:

```bash
bun run check
```

Repository-wide lint/format check:

```bash
bun run lint
```

Root lint is a single Biome pass over the repository. Workspace `lint` scripts are retained for targeted
package checks only, so the root command does not repeat the same Biome work per workspace.

Coverage visibility and thresholds:

```bash
bun run test:coverage
```

The coverage gate is implemented in `scripts/coverage.ts`. It runs Bun coverage for `server`, `client`, `cardinal-diff`, `cardinal-store`, and `cardinal-activity`, then fails if workspace function or line coverage drops below the configured thresholds.

Architecture boundary enforcement:

```bash
bun run architecture:check
```

The architecture gate is implemented in `scripts/architecture.ts`. It scans TypeScript imports and fails on undeclared local workspace dependencies or relative imports that cross workspace boundaries.

Spec-to-test enforcement:

```bash
bun run specs:check
```

The spec gate is implemented in `scripts/spec-enforcement.ts`. Specs in `docs/specs/*.spec.md` declare stable `SPEC-*` IDs, and tests must reference covered requirements with `@spec SPEC-*` comments. The gate fails on missing test references, unknown test references, or duplicated spec IDs.

Workspace docs to keep in sync with specs:

- `README.md`
- `client/README.md`
- `server/README.md`
- `cardinal-diff/README.md`
- `cardinal-activity/README.md`
- `cardinal-store/README.md`
- `cardinal-observability/README.md`
