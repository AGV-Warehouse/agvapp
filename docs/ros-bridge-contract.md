# ROS Bridge Contract

The first version of the app uses in-browser stand-ins. The production version should add a backend service between the iPad web app and the ROS robots.

## Recommended shape

```text
iPad PWA -> HTTP/WebSocket backend -> ROS bridge -> AGV robots
```

This keeps the tablet app simple and avoids putting ROS credentials, topic wiring, retries, and safety logic directly in the browser.

## Initial API

```http
GET /api/robots
GET /api/robots/:id/status
POST /api/robots/:id/cmd_vel
POST /api/robots/:id/navigate
POST /api/fleet/e_stop
POST /api/fleet/resume
WS /api/fleet/telemetry
```

## Command payloads

```json
{
  "command": "forward",
  "linear": 0.4,
  "angular": 0
}
```

```json
{
  "from": "A",
  "to": "D",
  "priority": "normal"
}
```

## ROS mapping draft

| App command | ROS concept |
| --- | --- |
| Manual forward/back/turn | `/cmd_vel` |
| Stop robot | zero velocity on `/cmd_vel` |
| Point-to-point command | navigation action or fleet task topic |
| Robot telemetry | odometry, battery, diagnostics, current task |
| Emergency stop | safety topic/service controlled by backend |

## Safety notes for v1 integration

- Backend should reject movement commands when a robot is disconnected, faulted, or emergency-stopped.
- Commands should include timeouts so stale tablet input cannot keep a robot moving.
- The app should display stale telemetry clearly if updates stop.
- Emergency stop should be fleet-wide and robot-specific once the real safety model is known.
