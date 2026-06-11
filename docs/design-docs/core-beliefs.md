# Core Beliefs

Status: Verified
last-reviewed: 2026-06-11

## Local-First Is A Product Boundary

The repository handles local session data, filesystem events, screenshot metadata, and optional Jira credentials. The architecture should keep those assumptions visible instead of drifting toward a hosted-service shape.

## Shared Persistence Reduces Drift

Agents and server readers should use `cardinal-store` rather than separate schema adapters. That makes migrations, repair routines, and query contracts easier to reason about.

## Specs Should Be Executable

Behavior specs are useful only when they are tied to tests. Stable `SPEC-*` IDs and the spec enforcement script keep documentation connected to the test suite.

## Tooling Should Be Inspectable

The app is for repeated technical inspection. UI choices should prioritize dense information, clear filters, stable navigation, and actionable failure states.
