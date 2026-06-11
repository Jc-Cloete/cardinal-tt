# Frontend

Status: Verified
last-reviewed: 2026-06-11

## Stack

- React 18
- Vite
- Strict TypeScript
- Radix Themes and Radix Icons
- `happy-dom` for focused rendered behavior tests

## UI Principles

- Prioritize dense, scannable local tooling over marketing-style presentation.
- Keep screens task-oriented: explorer, events, activity, Jira, and settings.
- Use persisted defaults only where they shorten repeated workflows.
- Surface user-triggered success/error/info/warning outcomes through the shared toast provider.
- Keep activity and timeline controls stable while data loads or selection changes.

## State Ownership

| Concern | Owner |
| --- | --- |
| Conversation explorer loading and selection | `client/src/hooks/useConversationExplorer.ts` |
| Timeline model | `client/src/utils/timeline.ts` |
| Preview parsing | `client/src/utils/preview.ts` |
| CardinalDiff heartbeat and tracking status | `client/src/features/cardinal/*` |
| Activity playback | `client/src/features/activity/*` |
| Jira workflows | `client/src/features/jira/*` |
| App settings | `client/src/features/settings/*` |
| Notifications | `client/src/notifications/ToastProvider.tsx` |
| Theme preference | `client/src/theme/ThemePreferenceProvider.tsx` |

## Testing Expectations

- Pure utilities should have direct unit tests.
- Rendered behavior tests should cover visible user-facing state transitions.
- Hook changes that affect async data loading should cover stale response and fallback behavior.
- Accessibility-sensitive controls should keep valid label/control relationships and explicit `type="button"` where needed.
