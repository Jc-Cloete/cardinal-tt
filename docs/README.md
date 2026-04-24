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

## Usage

When implementing features, treat specs here as product requirements and use workspace READMEs for implementation details.

## Quality Gates

Local quality checks:

```bash
bun run check
```

Coverage visibility and thresholds:

```bash
bun run test:coverage
```

The coverage gate is implemented in `scripts/coverage.ts`. It runs Bun coverage for `server`, `client`, `cardinal-diff`, `cardinal-store`, and `cardinal-activity`, then fails if workspace function or line coverage drops below the configured thresholds.

Workspace docs to keep in sync with specs:

- `README.md`
- `client/README.md`
- `server/README.md`
- `cardinal-diff/README.md`
- `cardinal-activity/README.md`
- `cardinal-store/README.md`
- `cardinal-observability/README.md`
