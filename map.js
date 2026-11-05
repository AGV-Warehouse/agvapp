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
 * The canvas backing buffer is the grid scaled up by a whole number of pixels
 * per cell (canvas.dataset.cellPx), and the context is left with that scale as
 * its transform, so every later drawing call works in grid-cell units.
 * @param {HTMLCanvasElement} canvas
 * @param {*} mapMsg raw nav_msgs/OccupancyGrid
 * @returns {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo, for later worldToPixel calls
 */
function renderOccupancyGrid(canvas, mapMsg) {
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
      if (cell < 0) {
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

// --- Furniture keep-out boxes ----------------------------------------------
// A 2D lidar sees a chair or table as a few separate leg-sized dots. Small
// blobs that sit close together are grouped and drawn as one box, so the map
// reads "furniture here" instead of scattered dots. Display only: Nav2 already
// treats any gap narrower than the 0.55 m footprint as blocked.
const OCCUPIED_MIN = 65; // map_server occupied_thresh 0.65
const FURNITURE_LEG_MAX_M = 0.15; // a blob no longer than this on both sides is a leg/post
const FURNITURE_LINK_M = 0.6; // legs with a gap up to this belong to the same piece
const FURNITURE_MARGIN_M = 0.1;

/**
 * Finds groups of two or more leg-sized blobs in an occupancy grid.
 * Legs touching a wall merge into the wall's blob and are not boxed.
 * @param {*} mapMsg raw nav_msgs/OccupancyGrid
 * @returns {{col0:number, row0:number, col1:number, row1:number, legs:number}[]}
 *   inclusive cell bounds in data rows (row 0 = bottom of the map), margin included
 */
function findFurnitureBoxes(mapMsg) {
  const { width, height, resolution } = mapMsg.info;
  const data = mapMsg.data;
  const legMaxCells = FURNITURE_LEG_MAX_M / resolution + 1e-6;
  const linkCells = FURNITURE_LINK_M / resolution + 1e-6;
  const marginCells = Math.round(FURNITURE_MARGIN_M / resolution);

  // 1. Connected blobs of occupied cells (8-neighbour), keep the leg-sized ones.
  const seen = new Uint8Array(width * height);
  const stack = [];
  const legs = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !(data[start] >= OCCUPIED_MIN)) continue;
    let c0 = width, c1 = -1, r0 = height, r1 = -1;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      const col = i % width;
      const row = (i - col) / width;
      c0 = Math.min(c0, col); c1 = Math.max(c1, col);
      r0 = Math.min(r0, row); r1 = Math.max(r1, row);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= height || c < 0 || c >= width) continue;
          const j = r * width + c;
          if (!seen[j] && data[j] >= OCCUPIED_MIN) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (c1 - c0 + 1 <= legMaxCells && r1 - r0 + 1 <= legMaxCells) legs.push({ c0, c1, r0, r1 });
  }

  // 2. Union legs whose bounding boxes are within linkCells of each other.
  // Sorted by c0, so the inner loop can stop once x alone is too far apart.
  legs.sort((a, b) => a.c0 - b.c0);
  const parent = legs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < legs.length; i++) {
    const a = legs[i];
    for (let j = i + 1; j < legs.length; j++) {
      const b = legs[j];
      if (b.c0 - a.c1 - 1 > linkCells) break;
      const gx = Math.max(0, b.c0 - a.c1 - 1, a.c0 - b.c1 - 1);
      const gy = Math.max(0, b.r0 - a.r1 - 1, a.r0 - b.r1 - 1);
      if (Math.hypot(gx, gy) <= linkCells) parent[find(j)] = find(i);
    }
  }

  // 3. One box per group of 2+ legs. A lone dot stays a dot.
  const groups = new Map();
  legs.forEach((leg, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (!g) groups.set(root, { col0: leg.c0, col1: leg.c1, row0: leg.r0, row1: leg.r1, legs: 1 });
    else {
      g.col0 = Math.min(g.col0, leg.c0); g.col1 = Math.max(g.col1, leg.c1);
      g.row0 = Math.min(g.row0, leg.r0); g.row1 = Math.max(g.row1, leg.r1);
      g.legs += 1;
    }
  });
  return [...groups.values()]
    .filter((g) => g.legs >= 2)
    .map((g) => ({
      col0: Math.max(0, g.col0 - marginCells),
      col1: Math.min(width - 1, g.col1 + marginCells),
      row0: Math.max(0, g.row0 - marginCells),
      row1: Math.min(height - 1, g.row1 + marginCells),
      legs: g.legs,
    }));
}

/**
 * Draws findFurnitureBoxes() output on a canvas prepared by renderOccupancyGrid
 * (context transform already in grid-cell units).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{height:number}} mapInfo
 * @param {{col0:number, row0:number, col1:number, row1:number}[]} boxes
 */
function drawFurnitureBoxes(ctx, mapInfo, boxes) {
  ctx.save();
  ctx.fillStyle = "rgba(198, 54, 46, 0.16)";
  ctx.strokeStyle = "#c6362e";
  ctx.lineWidth = 0.6; // grid cells
  boxes.forEach((box) => {
    // Data row 0 is the bottom of the map; canvas row 0 is the top.
    const x = box.col0;
    const y = mapInfo.height - 1 - box.row1;
    const w = box.col1 - box.col0 + 1;
    const h = box.row1 - box.row0 + 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  });
  ctx.restore();
}
