# Fleet HTTP/SSE Contract

The page is served by fleet_gateway from the same origin as /api.
openTCS is the order and traffic authority. The browser never rewrites a
vehicle's physical position or simulates task completion.

## Read endpoints

- GET /api/health: service and upstream availability
- GET /api/robots: robots, orders, revision, upstreamOnline, freshnessSource
- GET /api/layout: configured station IDs and display bounds in metres
- GET /api/orders/{id}: actual openTCS transport order state
- GET /api/events: named SSE event "fleet", containing a complete snapshot

Robot battery and velocity can be null. Missing/unverified data stays unknown.
online is based on openTCS's driver-reported vehicle state, not a direct robot
heartbeat. Gateway refresh age does not prove the robot is healthy.

## Control endpoints

All mutations require X-Fleet-Key matching FLEET_API_KEY on the server.
The key is kept in page memory. Cross-origin mutation is rejected.

POST /api/orders:
{"requestId":"unique-user-intent","to":"B","robotId":"AGV-01"}

robotId is optional for fleet allocation. to is a configured station ID.
Unknown fields (including a browser-selected physical starting position) are
rejected. Retry uncertain responses with the SAME requestId. A new content
payload with a reused ID is rejected. An accepted order is not an arrival.

- POST /api/orders/{id}/cancel: normal withdrawal, not an immediate emergency stop
- POST /api/robots/{id}/pause
- POST /api/robots/{id}/resume
- POST /api/fleet/pause
- POST /api/fleet/resume

Pause/resume replies mean requests were submitted. Fleet replies include
per-vehicle accepted/error results; they are not atomic fleet-wide control.
Wait for reported vehicle state to confirm pause or completion.

Web cmd_vel and hardware e-stop endpoints are NOT implemented in this release.
The manual pad is disabled. Operational pause is not a hardware emergency stop.

## Cache and reconnect

API and SSE responses use no-store. The service worker caches only static
assets. After a stream error or more than 10 seconds without a fleet update,
controls relying on fresh state are disabled. The stream reconnects and receives
a fresh complete snapshot. No cached position becomes control authority.

## Run

See ../fleet_integration/README.md in the workspace root. Open the page through
the Gateway's HTTP server, not by opening index.html as a file.
