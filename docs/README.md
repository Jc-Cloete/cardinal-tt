# Documentation

Status: Verified
last-reviewed: 2026-06-11

This directory is the source of truth for product behavior, architecture support docs, quality expectations, reliability, and security.

## Core Navigation

| Document | Status | Purpose |
| --- | --- | --- |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Verified | System boundaries, package layering, runtime entrypoints, and persistence ownership. |
| [product-specs/index.md](product-specs/index.md) | Verified | Index for behavior specs and requirement IDs. |
| [design-docs/index.md](design-docs/index.md) | Verified | Design rationale and operating principles. |
| [QUALITY_SCORE.md](QUALITY_SCORE.md) | Verified | Current quality assessment and important gaps. |
| [RELIABILITY.md](RELIABILITY.md) | Verified | Local reliability model and operational assumptions. |
| [SECURITY.md](SECURITY.md) | Verified | Local-only security posture and publish-safety rules. |
| [FRONTEND.md](FRONTEND.md) | Verified | Frontend conventions and UX constraints. |
| [DESIGN.md](DESIGN.md) | Verified | Product/design principles for local workflow tooling. |
| [PLANS.md](PLANS.md) | Verified | Planning conventions and plan locations. |

## Existing Specs

The package-level specs remain in [specs/](specs/) and are indexed from [product-specs/index.md](product-specs/index.md).

Specs declare stable `SPEC-*` IDs. Tests cover those IDs with `@spec` comments, and `bun run specs:check` fails on missing, duplicated, or unknown IDs.

## Quality Gates

Run the full local gate:

```bash
bun run check
```

Focused documentation check:

```bash
bun run docs:check
```

The docs check validates required canonical files and local Markdown links. Keep all repository documentation links relative.

## Documentation Rules

- Keep [../AGENTS.md](../AGENTS.md) concise and link out to deeper docs.
- Keep behavioral claims tied to code, specs, or tests.
- Mark uncertain claims explicitly instead of presenting them as verified.
- Update this index when adding new canonical docs.
- Do not commit local machine paths, credentials, cache paths with personal data, screenshots, or SQLite databases.
