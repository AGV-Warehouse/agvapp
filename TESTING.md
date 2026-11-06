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
