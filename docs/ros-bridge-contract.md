# ROS Bridge Contract

The app talks to the robot directly from the browser via `rosbridge` + vendored
`roslibjs` — no backend service in between:

```text
Browser (static JS + roslibjs) --ws://<jetson-ip>:9090--> rosbridge --> ROS graph
```

Select the mode at load time with a query param:

| URL | Mode |
| --- | --- |
| *(no `ros` param)* | the legacy 10-robot mock fleet demo |
| `?ros=mock` | live-robot UI driven by `createMockBridge()` — offline dev, no robot needed |
| `?ros=ws://192.168.1.171:9090` | the real robot |

`?ros=mock` runs the identical code path as the real robot, so the map/pose/
command UI can be built and tested with nothing on the network.

## Verified contract (checked live on the robot)

| What | Topic/Service | Type | Direction |
| --- | --- | --- | --- |
| Robot pose | `/amcl_pose` | `geometry_msgs/PoseWithCovarianceStamped` | subscribe, throttle 200 ms |
| Map | `/map` | `nav_msgs/OccupancyGrid` | subscribe once (latched) |
| Manual jog | `/cmd_vel` | `geometry_msgs/Twist` (unstamped) | publish at 10 Hz while held |
| Nav goal | `/goal_pose` | `geometry_msgs/PoseStamped`, `frame_id: 'map'` | publish |
| Initial pose | `/initialpose` | `geometry_msgs/PoseWithCovarianceStamped` | publish |
| Cancel goal | `/navigate_to_pose/_action/cancel_goal` | `action_msgs/srv/CancelGoal` (empty request cancels all) | call service |
| Planned path | `/plan` | `nav_msgs/Path` | subscribe, throttle 1000 ms |
| Object boxes | `/object_boxes` | `std_msgs/Float32MultiArray`, flat `[xmin, ymin, xmax, ymax, ...]` map-frame meters | publish latched; needs linorobot-new's `object_boxes.py` |
| Lidar overlay (optional) | `/scan` | `sensor_msgs/LaserScan` | subscribe, throttle ≥200 ms |

There is no battery-percentage topic yet — the robot publishes `/motor_current`,
not a battery topic — so the battery tile is hidden in real mode (`?ros=...`)
until firmware adds one.

Every subscription costs serialization CPU on the Jetson: throttle everything,
subscribe `/map` once (not periodically), and don't subscribe `/scan` unless
the lidar overlay is actually visible.

## Implementation status

- **Phase 0 (swap seam)** — done. `bridge.js` defines the shared `Bridge`
  interface (`onPose`, `onMap`, `onPath`, `onConnectionChange`, `sendGoal`,
  `setPose`, `publishBoxes`, `jog`, `stopJog`, `cancel`) and implements it twice: `createMockBridge()`
  (offline, self-contained) and `createRosBridge(url)` (real, via roslibjs).
- **Phase 1 (read-only telemetry)** — done. `RosBridge` subscribes to
  `/amcl_pose` (200 ms throttle) and `/map` (once), and `app.js` renders the
  occupancy grid + live pose marker to `<canvas id="mapCanvas">` using the
  coordinate transform in `map.js` (`worldToPixel`/`pixelToWorld`).
- **Phase 2 (commands: tap-to-goal, tap-to-set-pose, cancel)** — done, but
  **not yet tested on the robot**. Arm "Set Pose" or "Send Goal", then tap the
  map and drag to aim; arming is one-shot so a stray tap can't move the robot.
  Taps in the letterbox margin outside the grid are ignored.
  `/initialpose` uses RViz's covariance (0.25 / 0.25 / 0.068). Both publishes
  use `frame_id: 'map'` and a **zero stamp** — tf2 reads time 0 as "latest
  transform", which avoids goals being rejected for tablet/robot clock skew.
  Do not substitute `Date.now()`.
- **Phase 3 (manual jog)** — done, **not yet tested on the robot**. Dead-man
  pattern: the 10 Hz repeat timer lives inside `createRosBridge`, not the UI,
  so the UI only says start/stop and can't forget to re-publish. `stopJog()`
  clears the timer and publishes 3 explicit zero twists (a single stop packet
  lost on 2.4GHz WiFi must not leave the robot driving). Every press-exit path
  stops it: pointerup, pointerleave, pointercancel, window blur,
  visibilitychange, pagehide, and socket close. Speeds start at 0.1 m/s /
  0.3 rad/s. E-Stop = `stopJog()` + `cancel()`.
- **Phase 4 (hardening)** — partially done. Controls are disabled while
  disconnected and the pose marker greys out. Still missing:
  reconnect-with-backoff, stale-pose detection (>2s), and pruning the fleet UI.

The cancel service does **not** appear in `ros2 service list` or
`/rosapi/services` — the `_action/` name component makes it hidden. It is
callable anyway; verified live returning `{return_code: 0, goals_canceling: []}`.

## Test cadence

Phases 0–1 are safe against the live robot whenever bringup is running — pure
telemetry, no publishes. For Phases 2–3: floor clear or wheels up, nav started
fresh (`slam:=false` + `navigation.launch.py`), pose set within ~30s. The jog +
watchdog + cancel tests, once they pass, complete the end-to-end item from this
branch's `TESTING.md` §17.

## Safety notes carried over from the pre-ROS draft

- The UI should reject movement commands when disconnected, faulted, or
  emergency-stopped (Phase 4).
- Commands should be timed out client-side so a stale tab can't keep the
  robot moving — the dead-man jog pattern (Phase 3) and the firmware's 200 ms
  `/cmd_vel` watchdog are the two backstops.
- The app should display stale telemetry clearly if `/amcl_pose` updates stop
  (Phase 4: mark stale after >2s).
- Emergency stop is `stopJog()` + `cancel()` together (Phase 3).
