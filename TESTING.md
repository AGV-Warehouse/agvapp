# agvapp testing

## 1. Full-screen live map + furniture keep-out boxes

**What changed (2026-11-05):**

- In live mode (`?ros=...`) the map fills the screen. The sidebar is hidden
  (the rosbridge URL moved to the top bar) and the controls sit in a scrolling
  column on the right, with Manual Jog and E-Stop at the top. Below 980 px
  wide the controls drop under the map, which is 70% of the screen height.
- The map is drawn crisp: several canvas pixels per grid cell instead of one
  pixel stretched by CSS. `canvasPointToPixel()` divides that scale back out,
  so taps still land in grid cells.
- `findFurnitureBoxes()` in `map.js` groups occupied blobs no bigger than
  0.15 m (legs, posts) that are within 0.6 m of each other and draws one red
  box per group of 2 or more, with a 0.1 m margin. A single isolated dot is
  left as a dot. Legs touching a wall merge into the wall and aren't boxed.
  The boxes are display only; Nav2 already treats any gap narrower than the
  0.55 m footprint as blocked. Computed once per `/map`, in the browser, so it
  costs the Jetson nothing.

**Pass criteria and commands:**

1. **Unit test:**
   ```bash
   node test/map.test.js
   ```
   Pass: `map.test.js: PASS`.
2. **Offline, no robot:**
   ```bash
   python3 -m http.server 5173
   ```
   Open http://localhost:5173/?ros=mock.
   Pass: the Comms log reads `Received /map (100x100 @ 0.05m), 1 furniture boxes`.
   The chair (four dots, upper left) has a red box; the single dot lower right
   does not. No page scrollbar on a laptop-size window, and Manual Jog and
   E-Stop are visible without scrolling.
3. **Taps still map correctly (offline):** Send Goal, tap the centre of the
   chair box. Pass: Location reads about `1.00, 3.75 m` once the mock robot
   arrives. Set Pose and a drag-to-aim also land where the finger is.
4. **Live robot, telemetry only (safe, no publishes):** with bringup, nav and
   rosbridge running, open `http://localhost:5173/?ros=ws://192.168.1.171:9090`.
   Pass: the log reports the map size and a furniture box count; the boxes sit
   on clusters of dots you recognise as furniture; the robot marker moves with
   the robot.
5. **Tablet:** open the same URL on the operator tablet in landscape.
   Pass: map on the left, controls on the right, nothing cut off.

Verified 2026-11-05 in headless Chromium against `?ros=mock` and the repo's
saved maps (`apartment_map_3`: 9 boxes, `my_map`: 6 boxes) at 1440x900,
1180x820 and phone width; goal and set-pose taps land within one cell.
Not yet checked on the robot or the operator tablet (steps 4–5).

## 2. Service worker always revalidates

**What changed (2026-11-05):** `sw.js` fetches with `cache: "no-cache"` (cache
`v4`). Before, a network-first `fetch()` could still be answered from the
browser's HTTP cache: after the §1 update a browser showed the new
`index.html` with the old `app.js` and `styles.css` (rosbridge URL in the top
bar, but the old layout and no furniture count in the log).

**Pass:** serve the folder, load the app once, then edit any visible string in
`app.js` and reload normally (no hard reload). The change appears on the first
reload. With the server stopped, a reload still loads the app from the cache.
