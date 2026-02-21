# Spec: `client` (Conversation Explorer UI)

Status: Active  
Scope: `client`

## 1. Purpose

`client` is a React + Vite desktop web UI for:

- Navigating session data by year/month/day/project
- Visualizing conversations as a vertical compressed timeline
- Inspecting filtered preview messages in a modal
- Managing CardinalDiff tracking status and heartbeat visibility
- Browsing cardinal event streams by project/time range

## 2. Non-Goals

- No direct filesystem/database reads
- No persistence schema logic
- No watcher/event ingestion

## 3. Core Screens

1. Explorer page:
   - date/project filters
   - timeline panel
   - preview modal
   - cardinal diff panel
2. Events page:
   - project selector
   - day/from/to/limit controls
   - chronological event list

## 4. Data Dependencies

All data is read via `fetch` from `server` APIs:

- Session explorer endpoints under `/api/*`
- Cardinal endpoints under `/api/cardinal/*`

No mock or offline mode is currently part of the production contract.

## 5. UX/Behavior Requirements

### 5.1 Default selection behavior

- On initial load, year/month/day selectors should prefer current local date when available.
- Fallback order when current date is unavailable:
  - first available option for each selector.

### 5.2 Timeline model

Timeline must be vertical and support:

- Idle-gap compression:
  - split sections when inactivity exceeds `max(60 min, conversation_break_limit)`
- Minimum block visibility:
  - enforce minimum height so labels remain legible
- Overlap lanes:
  - concurrent conversation segments are placed side-by-side
- Multi-day ranges:
  - range labels/ticks handle day boundaries

### 5.3 Preview modal

- Opens when a timeline item is selected.
- Displays message cards parsed from filtered JSONL payload.
- Cards clamp to 3 lines by default with expand/collapse toggle.
- Shows tracked/untracked state for current project path.
- Supports immediate add/remove tracking actions.

### 5.4 Cardinal health visibility

- Header must show heartbeat status:
  - `healthy`
  - `stale`
  - `offline`
- Status is derived from server heartbeat endpoint polling.

### 5.5 Theme behavior

- Dark mode is default.
- User can toggle dark/light.
- Preference persists in `localStorage`.

## 6. State Management Contract

- Conversation explorer state is managed in `useConversationExplorer`.
- Cardinal tracking/heartbeat state is managed in `useCardinalStatus`.
- Cardinal diff compare state is managed in `useCardinalDiff`.
- Hooks must avoid stale closure behavior and follow exhaustive dependency rules.

## 7. Error Handling

- Failed fetches degrade gracefully:
  - empty lists or cleared sections instead of crashes.
- Invalid/empty payloads should not break rendering.
- Preview fetch failures should clear preview content and keep UI interactive.

## 8. Accessibility and Quality

- Interactive buttons MUST specify `type="button"` where relevant.
- Form-like control groups should not use invalid label/control patterns.
- Build/lint/typecheck must pass under strict Biome + TypeScript settings.

## 9. Test Requirements

Minimum required client tests:

- Happy path:
  - date utility behavior
  - preview parsing
  - timeline model generation
- Error path:
  - invalid time/json handling
  - empty model generation
- Edge cases:
  - overlap lane assignment scenarios
  - cross-day segment ranges
  - fallback display labels for unknown roles/projects

## 10. Change Management

When UI contracts change, update:

- `client/README.md`
- `docs/specs/client.spec.md`
- API assumptions in `docs/specs/server.spec.md`
