# Reliability

Status: Verified
last-reviewed: 2026-06-11

## Reliability Model

This is local workstation tooling, so reliability is measured by safe degradation, recoverable local state, and predictable behavior under changing filesystem/API conditions.

## Core Expectations

- The server should remain responsive when individual session files fail to parse.
- Cache entries should be reused only when file metadata and stable hashes indicate they are valid.
- CardinalDiff writes should keep commit/index state consistent through store transactions.
- Jira list views should prefer fresh cache, use remote sync when stale or forced, and fall back to stale cache when remote calls fail.
- Activity screenshot serving should fail closed when stored paths do not resolve under the configured data root.
- Background agents should publish heartbeat state so the UI can show healthy, stale, or offline status.

## Operational Assumptions

- Runtime is a trusted local macOS environment.
- FSEvents and LaunchAgents are available for CardinalDiff.
- Accessibility and Screen Recording permissions are granted when using activity tracking.
- Jira credentials are optional; local tests must not require live Jira access.
- SQLite storage is local and not shared across multiple machines.

## Recovery Paths

- Re-run `bun run check` after dependency or runtime changes.
- Reprocess a tracked CardinalDiff project when index history needs to be rebuilt:

```bash
cd cardinal-diff
bun run start projects reprocess <project_id>
```

- Use `--allow-active-agent` only when intentionally overriding the live-agent guard.
- Clear local caches only after confirming no needed local data is stored there.

## Known Reliability Risks

| Risk | Mitigation |
| --- | --- |
| macOS permissions prevent activity capture. | Permission requirements are documented in `cardinal-activity/README.md`; heartbeat status surfaces failures. |
| Remote Jira failures interrupt workflow. | Server cache logic can return stale cached data when available. |
| Large projects produce many filesystem events. | CardinalDiff debounces bursts and scans affected regions. |
| Local API accidentally exposed beyond loopback. | `HOST` defaults to loopback and browser-origin checks reject non-local origins. |
