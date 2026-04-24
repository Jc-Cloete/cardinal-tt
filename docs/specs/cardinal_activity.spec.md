# Spec: `cardinal-activity` (Window + Screenshot Tracker)

Status: Active
Scope: `cardinal-activity`

## 1. Purpose

`cardinal-activity` runs as a local macOS background process that captures:

- active/frontmost window transitions
- periodic full-screen screenshots

It stores both in the shared sqlite store so server/client can provide day-range scrubbing and playback.

## 2. Runtime Inputs

Environment:

- `CACHE_DB_PATH` (shared sqlite path)
- `CARDINAL_ACTIVITY_DATA_DIR` (screenshot storage root)
- `CARDINAL_ACTIVITY_WINDOW_POLL_MS`
- `CARDINAL_ACTIVITY_SCREENSHOT_INTERVAL_MS`
- `CARDINAL_ACTIVITY_SCREENSHOT_MAX_WIDTH`
- `CARDINAL_ACTIVITY_SCREENSHOT_QUALITY`
- `CARDINAL_ACTIVITY_HEARTBEAT_MS`

## 3. Responsibilities

1. Poll active window metadata on interval and persist only on changes.
2. Capture periodic full-screen screenshots.
3. Store screenshots efficiently using hash-based deduplicated assets plus time-based frame rows.
4. Write heartbeat metrics for health checks.
5. Expose CLI commands for running the agent and manual sampling.

## 4. Data Contract (Shared Store)

Window events:

- event id
- observed timestamp
- app name
- window title
- bundle id (nullable)
- pid (nullable)

Screenshot assets:

- asset id (`sha256`)
- content hash
- storage path
- bytes
- width/height (nullable)
- created timestamp

Screenshot frames:

- frame id
- observed timestamp
- asset id reference

Heartbeat:

- latest activity agent heartbeat timestamp + pid

## 5. Capture Pipeline

1. Window sampling (poll-based):
   - query frontmost app/window via AppleScript
   - compare against previous sample signature
   - persist only when changed

2. Screenshot sampling (interval-based):
   - capture full-screen jpg (`screencapture`)
   - compress/resize (`sips`) using configured quality/width
   - hash final bytes (`sha256`)
   - store file by hash if not already present
   - write frame row referencing asset

3. Heartbeat:
   - write periodic heartbeat metric for UI health display

## 6. Permission Requirements (macOS)

- Accessibility permission for active window metadata.
- Screen Recording permission for screenshot capture.

Agent must tolerate missing permissions gracefully (log warnings/errors, continue running).

## 7. CLI Contract

Supported commands:

- `agent run`
- `sample window`
- `sample screenshot`

CLI output is JSON for successful sampling commands.

## 8. Integration Contract

Server endpoints depend on this data:

- `GET /api/activity/window-events`
- `GET /api/activity/screenshots`
- `GET /api/activity/screenshots/:assetId`
- `GET /api/activity/heartbeat`

Client activity page consumes these endpoints for scrubbing and playback.

## 9. Mechanical Enforcement

| ID | Requirement | Test mapping |
| --- | --- | --- |
| SPEC-ACTIVITY-WINDOW-SAMPLE | Active-window sample parsing returns structured window metadata and degrades safely for invalid output. | `cardinal-activity/src/__tests__/window.test.ts` |

## 10. Non-goals

- No OCR/text extraction from screenshots
- No cross-device sync
- No upload to external services
- No keyboard/mouse event logging
