# AGV Fleet Control Prototype

This is a dependency-free web/PWA app for controlling a warehouse AGV fleet.
AGV-01 is a **real linorobot2 robot** driven over rosbridge; AGV-02..10 are
mock stand-ins until more robots exist.

## What is included

- Live ROS 2 control of AGV-01 via rosbridge (vendored roslib.js, no build step)
- Real map view: `/map` occupancy grid + live AMCL pose with heading
- Tap-to-navigate (Nav2 goals in world coordinates) and tap-to-set-pose
- Press-and-hold manual `/cmd_vel` jog with firmware-watchdog-backed safety
- 9 mock robot stand-ins alongside the real robot
- Robot overview and status cards
- Fleet emergency stop (cancels nav goals + zero velocity) and resume
- Installable PWA metadata

## Connecting to the robot

Start the robot stack (see the linorobot2 repo), then open the app with the
robot's rosbridge URL:

```text
http://<app-host>:5173?ros=ws://<robot-ip>:9090
```

The URL is remembered per device via `localStorage`; the default lives in
`config.js`. Serve the app over plain http on the LAN — https would block
`ws://` connections (see `docs/ros-bridge-contract.md`).

## Run locally

Open `index.html` directly in a browser for the quickest demo.

For PWA/service worker behavior, serve the folder over HTTP:

```powershell
py -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## ROS integration details

See `docs/ros-bridge-contract.md` for the full topic/service contract, the
`/goal_pose` goal mechanism, safety semantics, and how to add more real
robots. `tools/fake_robot.py` fakes the whole robot for hardware-free testing.
