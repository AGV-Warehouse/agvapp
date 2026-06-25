# AGV Fleet Control Prototype

This is a dependency-free web/PWA prototype for controlling a 10-robot warehouse AGV fleet.

## What is included

- Mock ROS bridge behavior
- 10 robot stand-ins from day one
- Robot overview and status cards
- Single-room temporary warehouse map
- Point-to-point navigation commands
- Manual `/cmd_vel` controls
- Fleet emergency stop and resume
- Installable PWA metadata

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

## Future ROS integration

The current app logs mock calls such as:

- `POST /ros/AGV-01/cmd_vel`
- `POST /ros/AGV-01/navigate`
- `POST /ros/fleet/e_stop`

When the real robot API is ready, replace the mock command functions in `app.js` with calls to a backend ROS bridge. The frontend can stay mostly the same.
