# cardinal-observability

Shared structured logging workspace for the monorepo.

Provides a strict, context-driven wide-event logger used by:

- `server`
- `client`
- `cardinal-diff`
- `cardinal-store`

## Scripts

```bash
bun run typecheck
bun run lint
bun run lint:fix
bun run test
```

## API

- `createWideEventLogger(options)`
- `createTraceId()`
- exported strict types:
  - `WideEventValue`, `WideEventObject`, `WideEventRecord`
  - `WideEventLevel`, `WideEventOutcome`
  - `WideEventLogger`

Logger features:

- hierarchical context via `child(context)`
- event logging via `log(...)`
- timed helper wrappers via:
  - `run(...)`
  - `runAsync(...)`
- automatic `trace_id` generation when absent
- structured error normalization (`error_name`, `error_message`, `error_stack`)

## Logging Principles

- Favor low-volume, high-cardinality wide events.
- Include rich contextual fields per event instead of fragmented logs.
- Keep event names stable and machine-queryable.
- Use `outcome: success|error` where applicable.

## Runtime Behavior

- Default sink writes JSON records to stdout/stderr.
- Log level threshold is configurable (`minLevel`).
- Logging can be silenced with `CARDINAL_LOG_SILENT=1`.
