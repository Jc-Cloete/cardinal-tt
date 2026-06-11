# Product Specs

Status: Verified
last-reviewed: 2026-06-11

| Document | Status | Owner | Last Reviewed | Notes |
| --- | --- | --- | --- | --- |
| [../specs/client.spec.md](../specs/client.spec.md) | Active | Engineering | 2026-06-11 | Client screens, state ownership, UX behavior, and test requirements. |
| [../specs/server.spec.md](../specs/server.spec.md) | Active | Engineering | 2026-06-11 | Session, CardinalDiff, activity, Jira, validation, and security API contracts. |
| [../specs/cardinal_diff.spec.md](../specs/cardinal_diff.spec.md) | Active | Engineering | 2026-06-11 | macOS filesystem change ledger behavior. |
| [../specs/cardinal_activity.spec.md](../specs/cardinal_activity.spec.md) | Active | Engineering | 2026-06-11 | Active-window and screenshot activity tracker behavior. |
| [../specs/cardinal_store.spec.md](../specs/cardinal_store.spec.md) | Active | Engineering | 2026-06-11 | Shared SQLite schema, repair, cache, and query behavior. |

## Enforcement

Specs declare `SPEC-*` requirement IDs. Tests reference covered requirements with `@spec`, and `bun run specs:check` fails when coverage drifts.
