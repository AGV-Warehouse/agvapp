# AGV Fleet Control Prototype

A dependency-free static web/PWA app for controlling a warehouse AGV. It can
run against an in-browser mock fleet (offline dev) or the real robot directly
over `rosbridge` + vendored `roslibjs` — see `docs/ros-bridge-contract.md` for
the full contract and phase status.

## What is included

- `bridge.js` — the `Bridge` swap seam: `createMockBridge()` (offline, 100%
  self-contained) and `createRosBridge(url)` (real robot via rosbridge)
- `map.js` — occupancy-grid canvas rendering + world/pixel coordinate transforms
- Mock mode: the original 10-robot fake fleet, point-to-point nav, manual pad, e-stop
- Real mode: live occupancy-grid map + live robot pose marker, map actions,
  manual jog and E-Stop. The map fills most of the screen
- Manual checks in `TESTING.md`
- Installable PWA metadata

## Run locally

For PWA/service worker behavior (and required for the roslibjs `fetch` of
`ws://` targets to behave normally), serve the folder over HTTP rather than
opening `index.html` directly:

```bash
python3 -m http.server 5173
```

Then open one of:

```text
http://localhost:5173/                              # 10-robot mock fleet demo
http://localhost:5173/?ros=mock                     # live-robot UI, driven offline by MockBridge
http://localhost:5173/?ros=ws://192.168.1.171:9090   # the real robot via rosbridge
```

`?ros=mock` is the offline dev environment: it runs the exact same code path
as the real robot (canvas map, pose marker, connection pill) against
`createMockBridge()`, so the live UI can be developed with no robot on the
network.

`roslib.min.js` is vendored into the repo root (not loaded from a CDN) since
the warehouse network may not have internet access.

## Robot-side startup (hjt-2@192.168.1.171)

Kill any previous stack first and **verify it's dead** — a half-killed stack
leaves duplicate map_servers and a stray slam_toolbox fighting AMCL over the
`map->odom` transform, which shows up in the app as a corrupted map and a
drifting pose:

```bash
pkill -9 -f slam_toolbox; pkill -9 -f nav2; pkill -9 -f amcl
pkill -9 -f map_server; pkill -9 -f rosbridge
ros2 node list   # must print nothing before continuing
```

Then, in order:

```bash
# Terminal 1 -- drivers, lidar, odom
source /opt/ros/jazzy/setup.bash && source ~/linorobot2_ws/install/setup.bash \
  && ros2 launch linorobot2_bringup robot.launch.py

# Terminal 2 (wait ~10s for terminal 1) -- localization + nav2.
# slam:=False keeps slam_toolbox from starting, publishing its own /map, and
# fighting AMCL for map->odom. Capital F -- the launch file evaluates this as
# a Python expression, so lowercase `false` fails with "name 'false' is not
# defined".
source /opt/ros/jazzy/setup.bash && source ~/linorobot2_ws/install/setup.bash \
  && ros2 launch linorobot2_navigation navigation.launch.py slam:=False

# Terminal 3 -- the websocket the app connects to
source /opt/ros/jazzy/setup.bash \
  && ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Health check before opening the app:

```bash
ros2 node list | grep -E "slam|amcl|map_server"
# want: amcl + map_server once each, NO slam_toolbox
```

The app fetches `/map` once per page load, so reload the page after any
robot-side restart. The Comms log should report the saved map's dimensions
(158x245 @ 0.025m), not a growing SLAM map. Set the initial pose within ~30s
of nav coming up.

## ROS integration status

Phase 0 (bridge interface) and Phase 1 (read-only telemetry: live pose +
map) are implemented. Phase 2 (tap-to-goal/set-pose, cancel), Phase 3
(manual jog, dead-man switch), and Phase 4 (hardening: reconnect, stale-pose
detection, fleet UI pruning) are not built yet — see
`docs/ros-bridge-contract.md` for the breakdown and test cadence.
