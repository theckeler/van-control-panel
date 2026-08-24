# Rubber Duck Review - Full Repository Review

**Date:** 2026-08-24

This review walked through the frontend, backend, deployment configuration, and
the existing operational documentation. The goal was to explain the system out
loud and separate actual defects from reasonable tradeoffs or unfinished work.

## What Is Working Well

- The frontend and backend have clear ownership boundaries.
- BLE services isolate hardware failures and use persistent state where the BMS
  requires it.
- Database access uses parameterized SQL queries.
- The frontend keeps stale values when one polling request fails, which is a
  useful behavior for an intermittently connected van.
- The production frontend build completes successfully.
- The repository documents several hardware limitations honestly instead of
  presenting unfinished integrations as complete.

## Issues Found

### 1. Authentication Fails Open by Default

`VAN_PASSWORD` defaults to an empty string in `frontend/server.mjs`, and
`VAN_API_KEY` defaults to an empty string in `backend/app/config.py`. The result
is that a deployment with missing environment configuration exposes the
dashboard and destructive API operations without authentication.

This is especially important because the API includes relay control, WiFi
switching, backup downloads, shutdown, and reboot endpoints.

**Suggested direction:** fail startup in production when credentials are
missing. Keep a local-development bypass only behind an explicit setting such
as `VAN_AUTH_DISABLED=true`.

### 2. Shelly Errors Can Be Reported as Successful Toggles

The Shelly client awaits the HTTP request but does not call
`response.raise_for_status()`. A device-side 4xx or 5xx response can therefore
be logged as a successful state change and reflected optimistically in the
frontend. Status reads have a related problem: an HTTP error can be treated as
an reachable device whose relay is off.

**Suggested direction:** call `raise_for_status()` for both status and toggle
requests, then return a 503 response when the device rejects or fails the
operation.

### 3. History, Event, and Photo Limits Are Unbounded

The API accepts arbitrary `hours`, `days`, `max_points`, and `limit` values.
`max_points=0` intentionally returns every raw row, but there is no upper bound
on the other values or on event and photo response sizes. This allows needless
large database queries and response payloads.

**Suggested direction:** use FastAPI `Query` constraints with documented
maximums. Preserve an explicit, authenticated full-history operation only if it
is genuinely needed.

### 4. The Nginx Example Can Bypass Express Authentication

The example nginx configuration proxies directly to uvicorn, while password
and signed-cookie authentication live in the Node server. If nginx is used as
the public server, protection depends entirely on the optional backend API key.
With the current fail-open default, that can become an unauthenticated
deployment.

**Suggested direction:** either remove the alternate public-server path, add an
equivalent authentication layer, or make the backend key mandatory whenever
uvicorn is bound beyond loopback.

### 5. CORS Is Broader Than Necessary

The backend allows all origins, methods, and headers while enabling credentials.
This is not the primary exposure because the normal frontend path is
same-origin and the backend uses an API-key header rather than a browser
session cookie. It still weakens defense in depth and makes accidental direct
exposure more permissive than needed.

**Suggested direction:** restrict CORS to known dashboard origins, or remove it
if direct browser access to uvicorn is not a supported workflow.

### 6. Camera Capture Returns Success Without Doing Anything

The capture endpoint returns `capture_triggered` even though it only contains a
TODO. It also does not validate the camera name, unlike the latest and recent
endpoints.

**Suggested direction:** return HTTP 501 until capture exists, or validate the
camera and connect the endpoint to the capture service before exposing it as a
successful action.

### 7. Linting Is Not Reproducible

The frontend `lint` script invokes ESLint, but ESLint is not listed in
`devDependencies`. `npm run lint` fails because the executable is unavailable.

**Suggested direction:** add a pinned ESLint configuration and dependency, or
remove the script until linting is intentionally supported.

## Claims Not Promoted to Defects

The initial concern about a BLE global-state race is not well supported. The
service state is primarily accessed on the asyncio event loop, and the
notification callback mutates only its local receive buffer before scheduling
completion. A lock should wait for a reproducible failure or a clearer
cross-thread access path.

Mode persistence is intentionally best effort. `_save_mode()` documents that a
read-only filesystem should not prevent the in-memory mode from changing. That
policy may be worth revisiting, but the ordering is not an accidental bug.

## Test Gaps

There are no repository test files. The highest-value tests to add first are:

- authentication with missing and configured secrets;
- Shelly HTTP error and unreachable-device behavior;
- bounds for history, event, and photo query parameters;
- mode persistence and startup recovery;
- BLE release and reconnect transitions;
- database rollup boundaries and pruning;
- frontend store behavior when individual polling requests fail.

## Validation

- `npm run build`: passed.
- `npm run lint`: blocked because ESLint is not installed or declared.
- Backend syntax validation: unavailable because Python is not installed on the
  review machine.
- Git worktree: clean before this document was added.

## Closing Thought

The project has a good foundation for a small, local-first control system. The
most important design decision to revisit is the fail-open authentication
policy. A missing secret should be easy to diagnose, but it should not quietly
turn a device with destructive controls into an open service on the local
network.
