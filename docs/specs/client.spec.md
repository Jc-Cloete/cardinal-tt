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
- Managing Jira projects/issues, comments, transitions, and ticket creation
- Configuring default Jira project/status/assignee filters
- Displaying global toast notifications for user-triggered outcomes

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
3. Jira page:
   - project selector
   - ticket list for selected project
   - searchable status/assignee multi-select filters
   - comment/status actions on selected ticket
   - ticket creation form
   - cache refresh/force-refresh controls
4. Settings page:
   - default Jira project selector
   - default Jira status/assignee multi-select selectors
   - options reload/force-refresh
   - save/reset settings controls

## 4. Data Dependencies

All data is read via `fetch` from `server` APIs:

- Session explorer endpoints under `/api/*`
- Cardinal endpoints under `/api/cardinal/*`
- Jira endpoints under `/api/jira/*`

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

### 5.6 Jira behavior

- Jira page must support project list and issue list browsing.
- Jira mutations must update UI immediately by reloading affected issue lists.
- Jira list views should show cache source/sync metadata when provided by API.
- Force refresh controls must bypass local cache and trigger remote sync via server.
- Default Jira filters from settings must apply to the active selected project.
- Default status/assignee filters must be matched case-insensitively against available options.
- Default filter application must wait for issue data loaded for the currently selected project.
- Jira issue loading must ignore stale in-flight responses when the selected project changes quickly.

### 5.7 Settings behavior

- Settings are persisted in localStorage.
- Jira defaults include:
  - `defaultProjectKey`
  - `defaultStatusFilters`
  - `defaultAssigneeFilters`
- Options for defaults are sourced from `/api/jira/filter-options`.
- Settings save/reset/reload actions are user-triggered and must be non-blocking.

### 5.8 Notification behavior

- A global toast provider must render top-right notifications.
- Toasts must follow active theme (dark/light) and typography.
- Toasts should be emitted for user-triggered success/error/info/warning outcomes.
- Toast integration must avoid causing rerender loops in data hooks.

## 6. State Management Contract

- Conversation explorer state is managed in `useConversationExplorer`.
- Cardinal tracking/heartbeat state is managed in `useCardinalStatus`.
- Cardinal diff compare state is managed in `useCardinalDiff`.
- Jira state/actions are managed in `useJira`.
- App settings state is managed in `useAppSettings`.
- Notification state is managed in `ToastProvider`.
- Hooks must avoid stale closure behavior and follow exhaustive dependency rules.

## 7. Error Handling

- Failed fetches degrade gracefully:
  - empty lists or cleared sections instead of crashes.
- Invalid/empty payloads should not break rendering.
- Preview fetch failures should clear preview content and keep UI interactive.
- Jira errors should remain non-fatal and keep the page interactive.
- User-triggered failures should surface visible toast feedback without crashing the page.

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
  - Jira selection fallback when selected project/issue is no longer present
  - default Jira status/assignee filters applying after project-specific issues load
  - stale Jira issue response suppression on rapid project switches

## 10. Change Management

When UI contracts change, update:

- `client/README.md`
- `docs/specs/client.spec.md`
- API assumptions in `docs/specs/server.spec.md`
