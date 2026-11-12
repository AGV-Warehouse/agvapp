// Occupancy-grid math + rendering shared by every feature that needs to go
// between ROS map coordinates (meters, origin bottom-left) and canvas pixel
// coordinates (origin top-left). Keep this the single source of truth for
// that transform -- Phase 2 (tap-to-goal, tap-to-set-pose, pose arrow) reuses
// these same two functions instead of re-deriving the y-flip.

/**
 * World (map frame, meters) -> canvas pixel.
 * @param {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo
 * @param {number} x
 * @param {number} y
 * @returns {{px:number, py:number}}
 */
function worldToPixel(mapInfo, x, y) {
  const px = (x - mapInfo.originX) / mapInfo.resolution;
  const py = mapInfo.height - 1 - (y - mapInfo.originY) / mapInfo.resolution;
  return { px, py };
}

/**
 * Canvas pixel -> world (map frame, meters). Inverse of worldToPixel.
 * Not used until Phase 2 (tap-to-goal needs it), defined now so the pair
 * lives in one place.
 * @param {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo
 * @param {number} px
 * @param {number} py
 * @returns {{x:number, y:number}}
 */
function pixelToWorld(mapInfo, px, py) {
  const x = px * mapInfo.resolution + mapInfo.originX;
  const y = (mapInfo.height - 1 - py) * mapInfo.resolution + mapInfo.originY;
  return { x, y };
}

/**
 * Extracts the plain-object mapInfo this module works with from a raw
 * nav_msgs/OccupancyGrid message.
 * @param {*} mapMsg
 */
function mapInfoFromMessage(mapMsg) {
  const info = mapMsg.info;
  return {
    resolution: info.resolution,
    width: info.width,
    height: info.height,
    originX: info.origin.position.x,
    originY: info.origin.position.y,
  };
}

// Each grid cell is drawn as a block of several canvas pixels. A 1px-per-cell
// bitmap stretched to fill the screen goes soft and reads as a dot pattern;
// blocks stay crisp. Capped because app.js re-blits the whole canvas on every
// pose update.
const MAP_MAX_CANVAS_PX = 1200;

/**
 * Draws a nav_msgs/OccupancyGrid to a canvas, once. Data is row-major int8:
 * -1 unknown, 0 free, 100 occupied (values in between are blended).
 * With cellClass (from classifyMap), occupied cells are coloured by class.
 * The canvas backing buffer is the grid scaled up by a whole number of pixels
 * per cell (canvas.dataset.cellPx), and the context is left with that scale as
 * its transform, so every later drawing call works in grid-cell units.
 * @param {HTMLCanvasElement} canvas
 * @param {*} mapMsg raw nav_msgs/OccupancyGrid
 * @param {Uint8Array} [cellClass] CELL_* per cell, from classifyMap
 * @returns {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo, for later worldToPixel calls
 */
function renderOccupancyGrid(canvas, mapMsg, cellClass) {
  const info = mapInfoFromMessage(mapMsg);
  const { width, height } = info;
  const data = mapMsg.data;

  const grid = document.createElement("canvas");
  grid.width = width;
  grid.height = height;
  const gridCtx = grid.getContext("2d");
  const imageData = gridCtx.createImageData(width, height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = data[row * width + col];
      // unknown -> light slate; free -> white; occupied -> near-black, blended
      let rgb;
      const cls = cellClass ? cellClass[row * width + col] : CELL_NONE;
      if (cls !== CELL_NONE) {
        rgb = CELL_COLORS[cls];
      } else if (cell < 0) {
        rgb = [226, 232, 240];
      } else {
        const t = Math.min(cell, 100) / 100;
        rgb = [255 - t * 224, 255 - t * 214, 255 - t * 200];
      }
      // Flip rows: row 0 of the data is the bottom of the map (ROS origin
      // bottom-left) but ImageData row 0 is the top of the canvas.
      const destRow = height - 1 - row;
      const idx = (destRow * width + col) * 4;
      imageData.data[idx] = rgb[0];
      imageData.data[idx + 1] = rgb[1];
      imageData.data[idx + 2] = rgb[2];
      imageData.data[idx + 3] = 255;
    }
  }
  gridCtx.putImageData(imageData, 0, 0);

  const cellPx = Math.max(1, Math.min(6, Math.floor(MAP_MAX_CANVAS_PX / Math.max(width, height))));
  canvas.width = width * cellPx;
  canvas.height = height * cellPx;
  canvas.dataset.cellPx = String(cellPx);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grid, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(cellPx, 0, 0, cellPx, 0, 0);
  return info;
}

/**
 * Pointer/client coords -> canvas pixel coords.
 *
 * The canvas is stretched to its box with `object-fit: contain`, so the drawn
 * grid is letterboxed inside the element: scaled by min(fitX, fitY) and
 * centred. A naive (clientX - rect.left) would therefore be wrong by the
 * letterbox offset and the scale factor -- which for a portrait map in a wide
 * box is a large error. Undo both here so tap-to-goal lands where the finger
 * actually pointed.
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{px:number, py:number}} grid-cell coords (may fall outside the grid)
 */
function canvasPointToPixel(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const drawnWidth = canvas.width * scale;
  const drawnHeight = canvas.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;
  const cellPx = Number(canvas.dataset.cellPx) || 1;
  return {
    px: (clientX - rect.left - offsetX) / scale / cellPx,
    py: (clientY - rect.top - offsetY) / scale / cellPx,
  };
}

/**
 * True when a canvas pixel coord is inside the grid.
 * @param {{width:number, height:number}} mapInfo
 * @param {{px:number, py:number}} point
 */
function isInsideGrid(mapInfo, point) {
  return point.px >= 0 && point.px < mapInfo.width && point.py >= 0 && point.py < mapInfo.height;
}

/**
 * Draws the robot as a circle (footprint) with a heading tick, in map-pixel
 * space. Both endpoints go through worldToPixel so the y-flip is handled
 * consistently with the grid itself. Reused by Phase 2's tap-to-goal /
 * tap-to-set-pose heading preview.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo
 * @param {{x:number, y:number, yaw:number}} pose
 * @param {{radiusMeters?:number, color?:string}} [options]
 */
function drawPoseMarker(ctx, mapInfo, pose, options) {
  const radiusMeters = (options && options.radiusMeters) || 0.2;
  const color = (options && options.color) || "#2563eb";
  const radiusPixels = Math.max(2, radiusMeters / mapInfo.resolution);

  const center = worldToPixel(mapInfo, pose.x, pose.y);
  const headingMeters = radiusMeters * 2;
  const tip = worldToPixel(
    mapInfo,
    pose.x + headingMeters * Math.cos(pose.yaw),
    pose.y + headingMeters * Math.sin(pose.yaw),
  );

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, radiusPixels * 0.15);
  ctx.beginPath();
  ctx.arc(center.px, center.py, radiusPixels, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(center.px, center.py);
  ctx.lineTo(tip.px, tip.py);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, radiusPixels * 0.3);
  ctx.stroke();
  ctx.restore();
}


// --- Walls vs objects ------------------------------------------------------
// A 2D lidar map is only occupied cells. To tell walls from objects:
//  1. Grow every occupied cell by half of wallGap and label the joined blobs,
//     so a wall broken into short fragments (common at 0.025 m) becomes one
//     blob, and the speckle along its edge joins it.
//  2. A blob at least wallMinLength long (bounding-box diagonal), or bigger
//     than objectMaxSize, is a wall.
//  3. The other blobs are object parts (a chair shows up as four leg dots).
//     Parts within objectLink of each other merge into one object, as long as
//     the merged object stays within objectMaxSize. That cap is what stops
//     clutter chaining into one huge box.
//  4. An object made of at least objectMinDots parts gets a box. Anything
//     smaller is drawn as a grey speck (usually noise or a lone post).
// Settings are in meters so they mean the same at any map resolution.
// Not display only: app.js sends the boxes to the robot (/object_boxes), which
// plans around them. Walls and specks are in the robot's map already.
const OCCUPIED_MIN = 65; // map_server occupied_thresh 0.65
const CELL_NONE = 0;
const CELL_WALL = 1;
const CELL_OBJECT = 2;
const CELL_SPECK = 3;
const CELL_COLORS = {
  [CELL_WALL]: [31, 41, 55],
  [CELL_OBJECT]: [180, 83, 9],
  [CELL_SPECK]: [148, 163, 184],
};
const MAP_DETECTION_DEFAULTS = {
  wallGap: 0.1,
  wallMinLength: 1.0,
  objectLink: 0.5,
  objectMaxSize: 1.2,
  objectMinDots: 2,
};
const OBJECT_BOX_MARGIN_M = 0.05;

/** Square dilation of a 0/1 grid by r cells, via prefix sums (row pass, then column pass). */
function dilateGrid(grid, width, height, r) {
  if (r <= 0) return grid;
  const pass = (src, lineCount, lineLen, at) => {
    const out = new Uint8Array(src.length);
    const prefix = new Int32Array(lineLen + 1);
    for (let line = 0; line < lineCount; line++) {
      for (let k = 0; k < lineLen; k++) prefix[k + 1] = prefix[k] + src[at(line, k)];
      for (let k = 0; k < lineLen; k++) {
        if (prefix[Math.min(lineLen, k + r + 1)] - prefix[Math.max(0, k - r)] > 0) out[at(line, k)] = 1;
      }
    }
    return out;
  };
  const rows = pass(grid, height, width, (row, col) => row * width + col);
  return pass(rows, width, height, (col, row) => row * width + col);
}

/**
 * @param {*} mapMsg raw nav_msgs/OccupancyGrid
 * @param {typeof MAP_DETECTION_DEFAULTS} settings
 * @returns {{cellClass: Uint8Array, boxes: {col0:number,row0:number,col1:number,row1:number,dots:number}[], walls: number}}
 *   box bounds are inclusive cells in data rows (row 0 = bottom of the map), margin included
 */
function classifyMap(mapMsg, settings) {
  const { width, height, resolution } = mapMsg.info;
  const data = mapMsg.data;
  const n = width * height;
  const occupied = new Uint8Array(n);
  for (let i = 0; i < n; i++) occupied[i] = data[i] >= OCCUPIED_MIN ? 1 : 0;

  // 1. Label the blobs of the grown grid; each blob's bounds use real cells only.
  const grown = dilateGrid(occupied, width, height, Math.round(settings.wallGap / 2 / resolution));
  const label = new Int32Array(n).fill(-1);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!occupied[start] || label[start] !== -1) continue;
    const blob = { c0: width, c1: -1, r0: height, r1: -1 };
    const id = blobs.length;
    blobs.push(blob);
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      const col = i % width;
      const row = (i - col) / width;
      if (occupied[i]) {
        blob.c0 = Math.min(blob.c0, col);
        blob.c1 = Math.max(blob.c1, col);
        blob.r0 = Math.min(blob.r0, row);
        blob.r1 = Math.max(blob.r1, row);
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= height || c < 0 || c >= width) continue;
          const j = r * width + c;
          if (grown[j] && label[j] === -1) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
  }

  // 2. Walls.
  const diagM = (b) => Math.hypot(b.c1 - b.c0 + 1, b.r1 - b.r0 + 1) * resolution;
  blobs.forEach((b) => {
    const size = diagM(b);
    b.wall = size >= settings.wallMinLength || size > settings.objectMaxSize;
  });

  // 3. Merge nearby object parts, never past objectMaxSize. Sorted by c0 so
  // the inner loop can stop once x alone is too far apart.
  const parts = blobs.map((b, id) => ({ ...b, id })).filter((b) => !b.wall);
  parts.sort((a, b) => a.c0 - b.c0);
  const linkCells = settings.objectLink / resolution + 1e-6;
  const parent = parts.map((_, i) => i);
  const group = parts.map((p) => ({ c0: p.c0, c1: p.c1, r0: p.r0, r1: p.r1, dots: 1 }));
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (b.c0 - a.c1 - 1 > linkCells) break;
      const gx = Math.max(0, b.c0 - a.c1 - 1, a.c0 - b.c1 - 1);
      const gy = Math.max(0, b.r0 - a.r1 - 1, a.r0 - b.r1 - 1);
      if (Math.hypot(gx, gy) > linkCells) continue;
      const ra = find(i);
      const rb = find(j);
      if (ra === rb) continue;
      const ga = group[ra];
      const gb = group[rb];
      const merged = {
        c0: Math.min(ga.c0, gb.c0),
        c1: Math.max(ga.c1, gb.c1),
        r0: Math.min(ga.r0, gb.r0),
        r1: Math.max(ga.r1, gb.r1),
        dots: ga.dots + gb.dots,
      };
      if (diagM(merged) > settings.objectMaxSize) continue;
      parent[rb] = ra;
      group[ra] = merged;
    }
  }

  // 4. Boxes for objects with enough dots; then classify every occupied cell.
  const blobClass = new Uint8Array(blobs.length).fill(CELL_WALL);
  const boxes = [];
  const marginCells = Math.round(OBJECT_BOX_MARGIN_M / resolution);
  parts.forEach((p, i) => {
    const root = find(i);
    const g = group[root];
    const isObject = g.dots >= settings.objectMinDots;
    blobClass[p.id] = isObject ? CELL_OBJECT : CELL_SPECK;
    if (isObject && root === i) {
      boxes.push({
        col0: Math.max(0, g.c0 - marginCells),
        col1: Math.min(width - 1, g.c1 + marginCells),
        row0: Math.max(0, g.r0 - marginCells),
        row1: Math.min(height - 1, g.r1 + marginCells),
        dots: g.dots,
      });
    }
  });
  const cellClass = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (occupied[i]) cellClass[i] = blobClass[label[i]];
  return { cellClass, boxes, walls: blobs.filter((b) => b.wall).length };
}

/**
 * Draws classifyMap() boxes on a canvas prepared by renderOccupancyGrid
 * (context transform already in grid-cell units).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{height:number}} mapInfo
 * @param {{col0:number, row0:number, col1:number, row1:number}[]} boxes
 */
function drawObjectBoxes(ctx, mapInfo, boxes) {
  ctx.save();
  ctx.fillStyle = "rgba(217, 119, 6, 0.14)";
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 0.6; // grid cells
  boxes.forEach((box) => {
    // Data row 0 is the bottom of the map; canvas row 0 is the top.
    const x = box.col0;
    const y = mapInfo.height - 1 - box.row1;
    ctx.fillRect(x, y, box.col1 - box.col0 + 1, box.row1 - box.row0 + 1);
    ctx.strokeRect(x, y, box.col1 - box.col0 + 1, box.row1 - box.row0 + 1);
  });
  ctx.restore();
}

/**
 * classifyMap() boxes as world rectangles, flat [xmin, ymin, xmax, ymax, ...]
 * in map-frame meters. This is the /object_boxes payload the robot stamps into
 * its planning map (linorobot2_navigation/scripts/object_boxes.py).
 * @param {{resolution:number, originX:number, originY:number}} mapInfo
 * @param {{col0:number, row0:number, col1:number, row1:number}[]} boxes
 * @returns {number[]}
 */
function boxesToWorldRects(mapInfo, boxes) {
  const { resolution, originX, originY } = mapInfo;
  return boxes.flatMap((box) => [
    originX + box.col0 * resolution,
    originY + box.row0 * resolution,
    originX + (box.col1 + 1) * resolution,
    originY + (box.row1 + 1) * resolution,
  ]);
}

// Below this much path left, the robot has arrived (Nav2 xy_goal_tolerance is
// 0.10 m) and the line is not drawn. Nav2 stops publishing /plan on arrival
// rather than sending an empty one, so the app has to decide this itself.
const PATH_DONE_M = 0.15;

/**
 * The part of a planned path still ahead of the robot: from the path point
 * nearest the robot to the end, starting at the robot itself.
 * @param {{x:number, y:number}[]} path
 * @param {{x:number, y:number}|null} pose
 * @returns {{x:number, y:number}[]} empty when there is nothing left to drive
 */
function pathAhead(path, pose) {
  if (!path || path.length < 2) return [];
  if (!pose) return path;
  let nearest = 0;
  let best = Infinity;
  path.forEach((p, i) => {
    const d = Math.hypot(p.x - pose.x, p.y - pose.y);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  const ahead = [{ x: pose.x, y: pose.y }, ...path.slice(nearest + 1)];
  let length = 0;
  for (let i = 1; i < ahead.length; i++) length += Math.hypot(ahead[i].x - ahead[i - 1].x, ahead[i].y - ahead[i - 1].y);
  return length < PATH_DONE_M ? [] : ahead;
}

/**
 * Draws a path (world coords) with a dot at its end, on a canvas prepared by
 * renderOccupancyGrid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo
 * @param {{x:number, y:number}[]} path
 * @param {{color?:string, dashed?:boolean}} [options]
 */
function drawPath(ctx, mapInfo, path, options) {
  if (path.length < 2) return;
  const color = (options && options.color) || "#16a34a";
  const pixels = path.map((p) => worldToPixel(mapInfo, p.x, p.y));
  const width = Math.max(1, 0.05 / mapInfo.resolution); // 5 cm line
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (options && options.dashed) ctx.setLineDash([width * 3, width * 2.5]);
  ctx.beginPath();
  pixels.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)));
  ctx.stroke();
  ctx.setLineDash([]);
  const end = pixels[pixels.length - 1];
  ctx.beginPath();
  ctx.arc(end.px, end.py, width * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Nav2 goal state -------------------------------------------------------
// The green /plan line only exists while Nav2 HAS a path. When the planner
// fails (robot mislocalized onto a wall, goal inside an object box, no route)
// Nav2 publishes nothing, so without this the map shows no sign of what the
// robot is trying to do. goalOverlay() decides what to draw instead.

// action_msgs/GoalStatus codes on /navigate_to_pose/_action/status.
const GOAL_STATUS = { ACCEPTED: 1, EXECUTING: 2, CANCELING: 3, SUCCEEDED: 4, CANCELED: 5, ABORTED: 6 };

// The planner replans at 1 Hz while a goal is active. Three missed replans
// means planning is failing, not just slow.
const PLAN_STALE_MS = 3000;

const OVERLAY_COLORS = {
  plan: "#16a34a", // green: following a fresh path
  stale: "#d97706", // amber: old path, replanning keeps failing
  waiting: "#64748b", // grey: goal sent, first path not in yet
  stuck: "#d97706", // amber: no path at all after PLAN_STALE_MS
  failed: "#dc2626", // red: Nav2 aborted the goal
};

/**
 * The newest goal in a GoalStatusArray's status_list (by accept stamp).
 * @param {{goal_info:{goal_id:{uuid:number[]}, stamp:{sec:number, nanosec:number}}, status:number}[]} statusList
 * @returns {{id:string, status:number}|null}
 */
function latestGoalStatus(statusList) {
  let best = null;
  (statusList || []).forEach((entry) => {
    const stamp = entry.goal_info.stamp;
    const t = stamp.sec + stamp.nanosec * 1e-9;
    if (!best || t >= best.t) best = { t, id: Array.from(entry.goal_info.goal_id.uuid).join(","), status: entry.status };
  });
  return best && { id: best.id, status: best.status };
}

/**
 * What to draw for the current goal, and a one-line explanation.
 * @param {{x:number, y:number, failed?:boolean, sentAt:number, planAt:number|null}|null} goal
 *   the goal this app sent (null: none, or it finished); times in ms
 * @param {{x:number, y:number}[]} path latest /plan
 * @param {{x:number, y:number}|null} pose
 * @param {number} now ms, same clock as sentAt/planAt
 * @returns {{line:{x:number, y:number}[], style:string|null, note:string}}
 *   style is a key of OVERLAY_COLORS; "waiting", "stuck" and "failed" are a
 *   straight robot-to-goal line (drawn dashed), since Nav2 has no path to show.
 */
function goalOverlay(goal, path, pose, now) {
  const ahead = pathAhead(path, pose);
  if (!goal) return { line: ahead, style: ahead.length ? "plan" : null, note: "" };
  const straight = pose ? [{ x: pose.x, y: pose.y }, { x: goal.x, y: goal.y }] : [];
  if (goal.failed) {
    return { line: straight, style: "failed", note: "Nav2 gave up: no path to the goal. If the robot looks misplaced, Set Pose first." };
  }
  if (goal.planAt == null) {
    const waited = Math.round((now - goal.sentAt) / 1000);
    return now - goal.sentAt > PLAN_STALE_MS
      ? { line: straight, style: "stuck", note: `No path after ${waited} s: the planner can't find a route. Is the robot's pose right?` }
      : { line: straight, style: "waiting", note: "Planning a path..." };
  }
  if (!ahead.length) return { line: [], style: null, note: "Arriving..." };
  const age = now - goal.planAt;
  return age > PLAN_STALE_MS
    ? { line: ahead, style: "stale", note: `Path is ${Math.round(age / 1000)} s old: replanning is failing. Robot may be blocked.` }
    : { line: ahead, style: "plan", note: "Following the planned path." };
}
