# Security Posture

Status: Active  
Scope: Local desktop development and personal telemetry tooling.

## Local-Only Boundary

This repository is designed to run on a trusted local workstation, not as an internet-facing service.

Server defaults enforce that assumption:

- `HOST` defaults to `127.0.0.1`.
- Browser requests with an `Origin` header must come from loopback origins:
  - `http://localhost:*`
  - `http://127.0.0.1:*`
  - `http://[::1]:*`
- Requests without an `Origin` header remain allowed for local CLI tooling and tests.
- Non-local browser origins receive `403`.

If `HOST` is changed to a non-loopback address, the deployment operator is also responsible for adding
authentication, transport security, and a narrower network-level access policy before exposing the API.

## Data Access Boundaries

- Session file reads are resolved under `DATA_ROOT`.
- Activity screenshot serving validates stored paths against `CARDINAL_ACTIVITY_DATA_DIR`.
- CardinalDiff project roots must be absolute directories inside the current user's home directory.
- Server database access should remain behind typed cache/store adapters; route modules should not issue raw SQL.

## Mechanical Enforcement

Local security assumptions are enforced by tests mapped to `SPEC-SERVER-LOCAL-SECURITY`:

- `server/src/__tests__/security.test.ts` covers loopback-origin parsing.
- `server/src/__tests__/api-contract.spec.ts` covers HTTP rejection of non-local browser origins.

Run the full local gate before changing middleware, file serving, or path resolution:

```bash
bun run check
```
