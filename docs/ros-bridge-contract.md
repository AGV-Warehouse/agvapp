# ROS Bridge Contract

The app talks to each robot **directly over rosbridge** — no intermediate
backend service. The robot runs `rosbridge_server` (WebSocket, port **9090**)
and the browser uses a vendored `roslib.js` 1.4.1 (`vendor/roslib.min.js`).

```text
iPad PWA  --ws://<robot-ip>:9090-->  rosbridge_server  <-->  ROS 2 graph (linorobot2 + Nav2)
```

The rosbridge URL is resolved in this order:

1. `?ros=ws://host:9090` query parameter
2. `localStorage["agv.rosbridgeUrl"]`
3. `APP_CONFIG.defaultRosbridgeUrl` in `config.js`

## Topics and services used

| Purpose | Name | Type | Direction |
| --- | --- | --- | --- |
| Robot pose | `/amcl_pose` | `geometry_msgs/msg/PoseWithCovarianceStamped` | subscribe |
| Velocity/smoothing | `/odom_rf2o` | `nav_msgs/msg/Odometry` | subscribe (throttled 200 ms) |
| Map | `/map` | `nav_msgs/msg/OccupancyGrid` | subscribe (CBOR) |
| Map fallback | `/map_server/map` | `nav_msgs/srv/GetMap` | service call |
| Manual jog | `/cmd_vel` | `geometry_msgs/msg/Twist` | publish @ 10 Hz while held |
| Navigation goal | `/goal_pose` | `geometry_msgs/msg/PoseStamped` | publish |
| Set AMCL pose | `/initialpose` | `geometry_msgs/msg/PoseWithCovarianceStamped` | publish |
| Nav progress | `/navigate_to_pose/_action/status` | `action_msgs/msg/GoalStatusArray` | subscribe |
| Cancel navigation | `/navigate_to_pose/_action/cancel_goal` | `action_msgs/srv/CancelGoal` | service call |

## Why `/goal_pose` instead of the NavigateToPose action

roslib 1.x (the only version shipped as a single classic-script UMD file) has
no ROS 2 action client, and roslibjs 2.x action support is ESM-only and still
flaky. Nav2's `bt_navigator` subscribes to `/goal_pose` and forwards it to its
own `navigate_to_pose` action server — this is exactly what RViz's "Nav2 Goal"
tool does. Cancellation uses the action's hidden cancel service with a zeroed
goal ID (= cancel all goals), and progress comes from the hidden
`_action/status` topic (2 = executing, 4 = succeeded, 5 = canceled,
6 = aborted).

## Manual jog and safety semantics

- Holding a jog button publishes a clamped `Twist` every 100 ms; releasing it
  publishes a zero `Twist` burst.
- The firmware stops the motors if `/cmd_vel` goes quiet for **200 ms**
  (watchdog), so a dropped connection or crashed tab cannot keep the robot
  moving.
- Jog speeds are capped in `config.js` to Nav2's `velocity_smoother` limits
  (linear ≤ 0.05 m/s, angular ≤ 0.25 rad/s for linorobot2).
- Starting a jog cancels any active navigation goal (both write `/cmd_vel`).
- **E-Stop** = cancel nav goal + stop jogging + zero-velocity burst. Resume
  never re-sends motion; commands must be issued fresh.
- Movement commands are rejected client-side when the robot is disconnected
  or the fleet is stopped, and the connection pill turns amber when telemetry
  is stale (> 5 s) and red when disconnected.

## Coordinates

The map view renders the `/map` occupancy grid on a canvas (letterboxed,
aspect-preserving). All conversions between the ROS map frame (meters, y up)
and the screen live in `map.js` (`worldToPercent`, `screenToWorld`). Map taps
in "Send goal" mode publish world-frame `PoseStamped` goals; "Set pose" mode
publishes `/initialpose` (needed once after starting Nav2 — do it within ~30 s
of launching navigation or its lifecycle nodes strand).

The Point-To-Point form needs world coordinates for the named points —
surveyed on-site and entered in `config.js` `namedGoals`. Points left `null`
are mock-only.

## Serving constraints (mixed content)

- Serve the app over **plain http** on the LAN (e.g. `python3 -m http.server`)
  so `ws://` connections are allowed. On https, browsers block `ws://`.
- Service workers only register on https or localhost, so on LAN http the app
  runs as a plain page (no offline cache) — this is expected and handled.
- `http://localhost` (dev) gets both the service worker and `ws://`.

## Adding a second real robot

Each robot runs its own rosbridge. Add a `type: "ros"` entry to
`APP_CONFIG.robots` in `config.js` with its topic names and a per-robot
rosbridge URL, and give the connection layer that URL (today all real robots
share `resolveRosbridgeUrl()`; per-robot URLs are the one wiring change
needed). Namespacing topics per robot requires namespace support in the
linorobot2 launch files, which does not exist yet.

## Testing without hardware

See `tools/fake_robot.py` — a small rclpy node that fakes the map, pose,
odometry, goal handling, and cancel service. Pair it with
`ros2 launch rosbridge_server rosbridge_websocket_launch.xml` and open the app
with `?ros=ws://localhost:9090`.
