# client

React + Vite frontend for exploring session conversations and CardinalDiff data.

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

## Source Layout

- `src/App.tsx`: top-level page switcher (`explorer` / `events`) and shared UI composition.
- `src/hooks/useConversationExplorer.ts`: data-loading orchestration for year/month/day/project/files/preview.
- `src/components/*`: explorer controls, timeline, preview modal, theme toggle.
- `src/features/cardinal/*`: CardinalDiff status hooks, diff UI, heartbeat badge, events page.
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
- Header shows CardinalDiff heartbeat (`healthy`/`stale`/`offline`).
- `Events` page supports project + datetime-range event stream browsing.
