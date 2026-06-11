# Technical Debt Tracker

Status: Active
last-reviewed: 2026-06-11

| ID | Area | Status | Evidence | Next Action |
| --- | --- | --- | --- | --- |
| TD-001 | Activity test depth | Open | Lower coverage threshold in `scripts/coverage.ts`. | Add focused tests before raising the threshold. |
| TD-002 | Store module size | Monitor | `cardinal-store/src/db.ts` owns schema, migrations, parsing, and queries. | Split around real feature pressure, not line count alone. |
| TD-003 | Jira remote dependency | Monitor | Jira workflows depend on optional credentials and upstream API availability. | Keep cache fallback behavior covered by tests. |
| TD-004 | Semantic docs drift | Open | `scripts/docs-check.ts` validates structure and links, not behavior semantics. | Add targeted drift checks only for stable invariants. |
