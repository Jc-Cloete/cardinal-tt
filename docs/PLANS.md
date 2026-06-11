# Plans

Status: Verified
last-reviewed: 2026-06-11

## Plan Locations

- Active work: [exec-plans/active/](exec-plans/active/)
- Completed work: [exec-plans/completed/](exec-plans/completed/)
- Technical debt: [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md)

## Plan Format

Use this structure for non-trivial changes:

```md
# <plan-name>

## Objective
## Scope and Non-Goals
## Decision Log
## Work Plan
## Validation Plan
## Progress Log
## Risks and Mitigations
## Outcome
```

Move completed plans into `docs/exec-plans/completed/` with the outcome filled in.

## Planning Rules

- Tie plans to specs or code evidence where possible.
- Keep work scoped to one domain boundary unless the change explicitly crosses boundaries.
- Include the validation command before implementation starts.
- Update the tech-debt tracker when deferring known gaps.
