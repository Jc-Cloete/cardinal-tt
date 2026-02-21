# cardinal-store

Shared persistence workspace used by both:

- `server`
- `cardinal-diff`

It provides a strict type model and a single sqlite schema/query implementation for CardinalDiff data.
It also stores Jira cache entities/sync markers used by `server`.

## Script

```bash
bun run typecheck
```

## Exports

- `createCardinalStore(dbPath)`
- default constants (ignore patterns, debounce/flush intervals, blob size limit)
- strict shared types (`ProjectConfig`, `CommitRecord`, `ChangedEntry`, `JsonValue`, etc.)
- project maintenance API (`reprocessProject`) for clearing stale project history and reseeding index snapshots.
- Jira cache APIs (`listJiraProjects`, `replaceJiraProjects`, `listJiraIssues`, `replaceJiraIssues`, `upsertJiraIssue`, `getJiraSyncAt`)

## Schema Ownership

`src/db.ts` owns:

- table creation
- additive schema migration helpers
- typed row parsing
- project/index/commit/metric CRUD/query operations
- project reprocess transaction (clear project commit/index history and replace with fresh index + cursor)
- Jira cache transactions (projects/issues snapshots + sync state updates)

Keeping schema logic here prevents drift between the agent writer and API reader.

## Files

- `src/types.ts`: canonical shared TypeScript models and JSON value types.
- `src/defaults.ts`: runtime defaults used by writer/reader layers.
- `src/db.ts`: sqlite schema + query implementation.
- `src/index.ts`: workspace public API barrel.
