# client

React + Vite frontend for exploring session conversations, CardinalDiff data, and Jira workflows.

## Scripts

```bash
bun run dev
bun run build
bun run preview
bun run typecheck
```

## Stack

- React 18
- TypeScript strict mode
- Vite
- Radix Themes + Radix Icons
- `happy-dom` for focused rendered component behavior tests

## Source Layout

- `src/App.tsx`: top-level page switcher (`explorer` / `events` / `activity` / `jira` / `settings`) and shared UI composition.
- `src/hooks/useConversationExplorer.ts`: data-loading orchestration for year/month/day/project/files/preview.
- `src/components/*`: explorer controls, timeline, preview modal, theme toggle, reusable searchable multi-select dropdown.
- `src/features/activity/*`: activity scrubber UI for screenshot frame playback + active-window context.
- `src/features/cardinal/*`: CardinalDiff status hooks, diff UI, heartbeat badge, events page.
- `src/features/jira/*`: Jira project/issue listing, ticket creation, comments, transitions.
- `src/features/settings/*`: persisted app settings for Jira defaults and options loading.
- `src/notifications/ToastProvider.tsx`: global toast provider and `useToast` hook.
- `src/theme/ThemePreferenceProvider.tsx`: dark-mode default + persisted user preference.
- `src/utils/timeline.ts`: vertical timeline model builder (segments, compression, lane assignment).
- `src/utils/preview.ts`: JSONL preview parsing into readable chat cards.
- `src/types.ts`: strict app-level DTOs and JSON types.

## UX Behavior

- Defaults year/month/day to local current date when those options exist in data.
- Timeline is vertical and supports:
  - multi-day spans
  - idle-gap compression
  - side-by-side lanes for overlapping conversations
- Timeline item click opens a modal preview with:
  - message cards (3-line clamp + expand/collapse)
  - project tracking state (tracked/untracked)
  - add/remove tracking actions
- Timeline selection uses a stable `relativePath` file key so conversations that span multiple days can be opened from any day timeline.
- Header shows CardinalDiff heartbeat (`healthy`/`stale`/`offline`).
- `Events` page supports project + datetime-range event stream browsing.
- `Activity` page supports:
  - day + time range scrubbing
  - screenshot frame timeline/slider playback
  - active window event context
  - tracker heartbeat status display
- `Jira` page supports:
  - project list and ticket list browsing
  - searchable multi-select status/assignee filters
  - cache-aware refresh and force-refresh
  - adding ticket comments
  - moving ticket status via transitions
  - creating tickets with optional target status
- `Settings` page supports:
  - default Jira project
  - default Jira status filters
  - default Jira assignee filters
  - persisted settings in localStorage
  - reload/force-refresh of Jira filter options

## Notifications

- Global toast notifications are rendered in the top-right and respect current theme.
- Toast feedback is wired for user-triggered Explorer, Events, Jira, Settings, and Cardinal tracking actions.
- Toast provider is memoized to avoid effect churn and unnecessary rerender loops in hooks that depend on toast methods.

## Jira Default Filters

- Jira defaults are read from app settings and applied per selected project.
- Filter defaults apply only when issue data for the selected project has been loaded.
- Jira issue loading guards against stale in-flight responses during rapid project switches.

## Testing

- Pure utility tests cover date, display, preview, and timeline model logic.
- DOM behavior tests cover rendered UI behavior such as theme toggling and timeline item selection.
