// Renders a nav_msgs/OccupancyGrid onto a canvas and converts between the
// ROS map frame (meters, y up) and the map container (percent / pixels, y down).
class MapRenderer {
  constructor(canvasEl, containerEl) {
    this.canvas = canvasEl;
    this.container = containerEl;
    this.ctx = canvasEl.getContext("2d");
    this.grid = null;
    this.offscreen = null;
    this.layout = null; // { scale, drawnW, drawnH, offsetX, offsetY }

    this.resizeObserver = new ResizeObserver(() => this.redraw());
    this.resizeObserver.observe(containerEl);
  }

  hasMap() {
    return this.grid !== null;
  }

  setGrid(msg) {
    const { resolution, width, height, origin } = msg.info;
    const originYaw = 2 * Math.atan2(origin.orientation.z, origin.orientation.w);
    if (Math.abs(originYaw) > 0.01) {
      console.warn(`Map origin yaw ${originYaw.toFixed(3)} rad is unsupported; rendering as if 0.`);
    }
    this.grid = {
      resolution,
      width,
      height,
      originX: origin.position.x,
      originY: origin.position.y,
    };

    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext("2d");
    const image = offCtx.createImageData(width, height);
    const data = msg.data;
    for (let cy = 0; cy < height; cy += 1) {
      for (let cx = 0; cx < width; cx += 1) {
        // Grid row 0 is the world-frame bottom; canvas row 0 is the top.
        const value = data[cy * width + cx];
        const pixel = ((height - 1 - cy) * width + cx) * 4;
        let r;
        let g;
        let b;
        if (value < 0) {
          [r, g, b] = [216, 224, 230]; // unknown: muted gray (app --line tone)
        } else if (value >= 65) {
          [r, g, b] = [39, 49, 63]; // occupied: dark ink
        } else {
          // free (0, near-white) darkening toward occupied with cost
          const t = value / 65;
          r = Math.round(248 - t * 209);
          g = Math.round(250 - t * 201);
          b = Math.round(252 - t * 189);
        }
        image.data[pixel] = r;
        image.data[pixel + 1] = g;
        image.data[pixel + 2] = b;
        image.data[pixel + 3] = 255;
      }
    }
    offCtx.putImageData(image, 0, 0);
    this.offscreen = offscreen;
    this.redraw();
  }

  redraw() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.offscreen) {
      this.layout = null;
      return;
    }

    const scale = Math.min(
      this.canvas.width / this.offscreen.width,
      this.canvas.height / this.offscreen.height,
    );
    const drawnW = this.offscreen.width * scale;
    const drawnH = this.offscreen.height * scale;
    const offsetX = (this.canvas.width - drawnW) / 2;
    const offsetY = (this.canvas.height - drawnH) / 2;
    this.layout = { scale, drawnW, drawnH, offsetX, offsetY };

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.offscreen, offsetX, offsetY, drawnW, drawnH);
  }

  // World (map frame, meters) -> percent position within the container,
  // for absolutely-positioned DOM markers. Returns null until a map is drawn.
  worldToPercent(x, y) {
    if (!this.grid || !this.layout) return null;
    const { resolution, width, height, originX, originY } = this.grid;
    const u = (x - originX) / (width * resolution);
    const v = 1 - (y - originY) / (height * resolution);
    const px = this.layout.offsetX + u * this.layout.drawnW;
    const py = this.layout.offsetY + v * this.layout.drawnH;
    return {
      leftPct: (px / this.canvas.width) * 100,
      topPct: (py / this.canvas.height) * 100,
    };
  }

  // Screen tap -> world coordinates in the map frame, or null when the tap
  // lands outside the drawn (letterboxed) map.
  screenToWorld(clientX, clientY) {
    if (!this.grid || !this.layout) return null;
    const rect = this.container.getBoundingClientRect();
    const u = (clientX - rect.left - this.layout.offsetX) / this.layout.drawnW;
    const v = (clientY - rect.top - this.layout.offsetY) / this.layout.drawnH;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const { resolution, width, height, originX, originY } = this.grid;
    return {
      x: originX + u * width * resolution,
      y: originY + (1 - v) * height * resolution,
    };
  }
}

function yawFromQuaternion(q) {
  return 2 * Math.atan2(q.z, q.w);
}
