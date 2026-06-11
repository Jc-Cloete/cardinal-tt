# Design

Status: Verified
last-reviewed: 2026-06-11

## Product Shape

`cardinal-tt` is a local command-center style tool. It should feel like a technical operations surface: compact, clear, and useful for repeated inspection work.

## Design Principles

- Show real operational state instead of explanatory filler.
- Keep navigation stable across explorer, events, activity, Jira, and settings.
- Prefer explicit controls for filters, refreshes, date ranges, and settings.
- Keep local-first privacy visible where it affects user trust.
- Make failure states actionable without interrupting unrelated workflows.

## Interaction Principles

- Timeline interactions should preserve context and open details without changing the selected date/project unexpectedly.
- Jira filters should respect user defaults but avoid hiding all data silently.
- Activity playback should keep screenshot frame, time range, and active-window context aligned.
- Toasts should confirm user-triggered actions, not background noise.

## Non-Goals

- No landing page inside the app.
- No hosted collaboration model.
- No remote sync workflow.
- No restore/checkout feature for CardinalDiff even when content snapshots are available.
