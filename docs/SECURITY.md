# Security Posture

Status: Verified
last-reviewed: 2026-06-11

## Scope

This repository is designed for trusted local workstation use. It is not an internet-facing service and does not include hosted multi-user authentication.

## Local-Only Boundary

Server defaults enforce the local-first assumption:

- `HOST` defaults to `127.0.0.1`.
- Browser requests with an `Origin` header must come from loopback origins:
  - `http://localhost:*`
  - `http://127.0.0.1:*`
  - `http://[::1]:*`
- Requests without an `Origin` header remain allowed for local CLI tooling and tests.
- Non-local browser origins receive `403` before route handling.

If `HOST` is changed to a non-loopback address, the operator must add authentication, transport security, and network-level access policy before exposing the API.

## Data Access Boundaries

- Session file reads are resolved under `DATA_ROOT`.
- Activity screenshot serving validates stored paths against `CARDINAL_ACTIVITY_DATA_DIR`.
- CardinalDiff project roots must be absolute directories inside the current user's home directory.
- Server database access should remain behind typed cache/store adapters; route modules should not issue raw SQL.

## Secret Handling

- `.env` files are ignored and must stay local.
- Jira credentials belong in local environment variables only:
  - `JIRA_BASE_URL`
  - `JIRA_AUTH_TOKEN`, or `JIRA_EMAIL` + `JIRA_API_TOKEN`
- Do not commit SQLite databases, `.cache/`, screenshots, session exports, tokens, private keys, certificates, or local machine paths.
- Documentation should use relative repository links, not absolute local paths.

## Mechanical Enforcement

Local security assumptions are covered by tests mapped to `SPEC-SERVER-LOCAL-SECURITY`:

- `server/src/__tests__/security.test.ts` covers loopback-origin parsing.
- `server/src/__tests__/api-contract.spec.ts` covers HTTP rejection of non-local browser origins.

Publish-safety checks before making the repository public:

```bash
git ls-files
git log --oneline
bun run check
bun run docs:check
```

For deeper release preparation, run a redacted secret scan across `main` history and confirm ignored local `.env` files are not tracked.
