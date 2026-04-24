# cardinal-activity

macOS activity tracker workspace for:

- Active/frontmost window tracking
- Periodic full-screen screenshot capture
- Efficient screenshot storage via hash-based deduplication
- Time-range playback data for day scrubbing in the UI

## Scripts

```bash
bun run dev
bun run start
bun run typecheck
bun run test
```

## Environment

- `CACHE_DB_PATH`: shared sqlite path (defaults to `~/.cardinal-diff/index/cardinaldiff.sqlite`)
- `CARDINAL_ACTIVITY_DATA_DIR`: storage root for screenshot files (default `~/.cardinal-activity`)
- `CARDINAL_ACTIVITY_WINDOW_POLL_MS`: active-window polling interval (default `3000`)
- `CARDINAL_ACTIVITY_SCREENSHOT_INTERVAL_MS`: screenshot interval (default `15000`)
- `CARDINAL_ACTIVITY_SCREENSHOT_MAX_WIDTH`: max image width before storing (default `1920`)
- `CARDINAL_ACTIVITY_SCREENSHOT_QUALITY`: JPEG quality (default `60`)
- `CARDINAL_ACTIVITY_HEARTBEAT_MS`: heartbeat interval (default `15000`)

## CLI

```bash
bun run start agent run
bun run start sample window
bun run start sample screenshot
```

## Permission Requirements (macOS)

- Accessibility permission is required for active window metadata.
- Screen Recording permission is required for screenshot capture.

Grant these permissions to the terminal/app that runs this service.
