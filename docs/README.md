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

Workspace docs to keep in sync with specs:

- `README.md`
- `client/README.md`
- `server/README.md`
- `cardinal-diff/README.md`
- `cardinal-activity/README.md`
- `cardinal-store/README.md`
- `cardinal-observability/README.md`
