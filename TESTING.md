# agvapp testing

## 1. Full-screen live map

**What changed (2026-11-05):**

- In live mode (`?ros=...`) the map fills the screen. The sidebar is hidden
  (the rosbridge URL moved to the top bar) and the controls sit in a scrolling
  column on the right, with Manual Jog and E-Stop at the top. Below 980 px
  wide the controls drop under the map, which is 70% of the screen height.
- The map is drawn crisp: several canvas pixels per grid cell instead of one
  pixel stretched by CSS. `canvasPointToPixel()` divides that scale back out,
  so taps still land in grid cells.

**Removed the same day: automatic "furniture" boxes.** They grouped
leg-sized occupied blobs within 0.6 m of each other. On the live 0.025 m map
the walls are broken into many short fragments, so the grouping chained wall
fragments into large boxes covering open floor and gave no useful information.
It's in git history (`36e0673`). Don't bring it back without testing on the
robot's real map first; hand-drawn zones are the better route.

**Pass criteria and commands:**

1. **Offline, no robot:**
   ```bash
   python3 -m http.server 5173
   ```
   Open http://localhost:5173/?ros=mock.
   Pass: no page scrollbar on a laptop-size window; Manual Jog and E-Stop
   visible without scrolling; walls drawn as sharp solid lines.
2. **Taps still map correctly (offline):** Send Goal, tap a spot on the map.
   Pass: the mock robot drives to the tapped spot. Set Pose and drag-to-aim
   also land where the finger is.
3. **Live robot, telemetry only (safe, no publishes):** with bringup, nav and
   rosbridge running, open `http://localhost:5173/?ros=ws://192.168.1.171:9090`.
   Pass: the log reports the map size and the robot marker moves with the robot.
4. **Tablet:** open the same URL on the operator tablet in landscape.
   Pass: map on the left, controls on the right, nothing cut off.

Verified 2026-11-05 in headless Chromium against `?ros=mock` at 1440x900,
1180x820 and phone width; goal and set-pose taps land within one cell.
Not yet checked on the operator tablet (step 4).

## 2. Service worker always revalidates

**What changed (2026-11-05):** `sw.js` fetches with `cache: "no-cache"` (cache
`v4`). Before, a network-first `fetch()` could still be answered from the
browser's HTTP cache: after the §1 update a browser showed the new
`index.html` with the old `app.js` and `styles.css` (rosbridge URL in the top
bar, but the old layout and no furniture count in the log).

**Pass:** serve the folder, load the app once, then edit any visible string in
`app.js` and reload normally (no hard reload). The change appears on the first
reload. With the server stopped, a reload still loads the app from the cache.

## 3. Walls vs objects, with adjustable detection

**What changed (2026-11-05):** `classifyMap()` in `map.js` sorts the map's
occupied cells into walls, objects and specks, and a Map Detection panel
lets the operator tune it live. Display only: navigation still uses the raw
map. It runs in the browser on the cached `/map`, so moving a slider costs the
Jetson nothing.

How it decides (all distances in meters, so they hold at any resolution):

1. Occupied cells are grown by half of **Join wall gaps up to** and joined
   into blobs. A wall broken into short fragments becomes one blob.
2. A blob longer than **Wall if longer than** (bounding-box diagonal), or
   bigger than **Largest object**, is a wall (dark).
3. Remaining blobs within **Group object dots within** of each other merge
   into one object, but never past **Largest object**. That cap is what the
   §1 version lacked: without it, wall fragments chained into huge boxes.
4. An object with at least **Dots needed for a box** parts gets an amber box;
   smaller ones are grey specks.

Defaults: 0.1 m, 1.0 m, 0.5 m, 1.2 m, 2 dots. Settings are saved per browser
(`localStorage`, key `agv.mapDetection`); stored values are clamped to each
slider's range. **Reset to defaults** restores them.

**Pass criteria and commands:**

1. **Unit test:**
   ```bash
   node test/map.test.js
   ```
   Pass: `map.test.js: PASS`. It covers a solid wall, a wall with 5 cm gaps,
   a chair (4 legs), a lone post, a dot line that must not chain into one
   box, and every slider at both extremes.
2. **Offline:** open http://localhost:5173/?ros=mock.
   Pass: the log reads `Received /map (100x100 @ 0.05m): 2 walls, 1 objects`.
   The chair (upper left) has an amber box, the broken line in the middle is
   dark like the outer walls, and the single dot lower right is grey.
3. **Sliders:** move **Dots needed for a box** to 1.
   Pass: the lone dot gets a box and the panel summary updates immediately.
   Reload: the setting is kept. **Reset to defaults**: back to 1 object.
4. **Live map:** with the robot running, open
   `http://localhost:5173/?ros=ws://192.168.1.171:9090`.
   Pass: walls are dark and furniture/clutter is boxed. If walls come out
   amber, raise **Join wall gaps up to**; if objects merge into walls, lower it.

Verified 2026-11-05 in headless Chromium: `?ros=mock`, the repo's
`apartment_map_3` (11 walls, 6 objects), and a 326x590 @ 0.025 m grid
rebuilt from a screenshot of the live map (11 walls, 11 objects, no box over
open floor). Not yet checked against the live `/map` itself (step 4).

