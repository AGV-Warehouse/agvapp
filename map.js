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

/**
 * Draws a nav_msgs/OccupancyGrid to a canvas, once. Data is row-major int8:
 * -1 unknown, 0 free, 100 occupied (values in between are shades of grey).
 * Sizes the canvas's backing pixel buffer to the grid's own width/height so
 * every cell is exactly one pixel; CSS handles scaling it up to fill the box.
 * @param {HTMLCanvasElement} canvas
 * @param {*} mapMsg raw nav_msgs/OccupancyGrid
 * @returns {{resolution:number, width:number, height:number, originX:number, originY:number}} mapInfo, for later worldToPixel calls
 */
function renderOccupancyGrid(canvas, mapMsg) {
  const info = mapInfoFromMessage(mapMsg);
  const { width, height } = info;
  const data = mapMsg.data;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = data[row * width + col];
      let shade;
      if (cell < 0) {
        shade = 170; // unknown -> mid-grey
      } else {
        // 0 (free) -> white (255), 100 (occupied) -> black (0)
        shade = Math.round(255 - (Math.min(cell, 100) / 100) * 255);
      }
      // Flip rows: row 0 of the data is the bottom of the map (ROS origin
      // bottom-left) but ImageData row 0 is the top of the canvas.
      const destRow = height - 1 - row;
      const idx = (destRow * width + col) * 4;
      imageData.data[idx] = shade;
      imageData.data[idx + 1] = shade;
      imageData.data[idx + 2] = shade;
      imageData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
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
 * @returns {{px:number, py:number}} canvas pixel coords (may fall outside the grid)
 */
function canvasPointToPixel(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const drawnWidth = canvas.width * scale;
  const drawnHeight = canvas.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;
  return {
    px: (clientX - rect.left - offsetX) / scale,
    py: (clientY - rect.top - offsetY) / scale,
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
