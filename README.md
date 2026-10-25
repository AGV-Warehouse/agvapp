# AGV Fleet Control

Real same-origin HTTP/SSE frontend for the workspace Fleet Gateway and openTCS 7.5.
Mock vehicles, simulated arrivals, and synthetic battery updates have been removed.
Manual driving is disabled; Pause Fleet requests an operational pause.

Run the workspace Gateway using fleet_integration/README.md, then open its HTTP URL.
Opening index.html directly is no longer the runtime entry point.

Enter the server's control key in the page to send commands. Unknown/stale vehicle
state is shown explicitly. HTTP acceptance does not imply arrival or confirmed stop.

API contract: docs/ros-bridge-contract.md.
Tests: node --test tests/fleet-api.test.cjs
