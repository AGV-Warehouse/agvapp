const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pixelToWorld, worldToPixel, rasterMatrix } = require("../editor.js");

test("ROS origin is the bottom-left grid edge; image rows run downwards", () => {
  const map = {
    resolution: 0.05,
    width: 200,
    height: 100,
    origin: [-3.7, -4.652, 0],
  };
  assert.deepEqual(pixelToWorld(map, 0, 100), { x: -3.7, y: -4.652 });
  const top = pixelToWorld(map, 0, 0);
  assert.ok(Math.abs(top.y - 0.348) < 1e-10);
  const centre = pixelToWorld(map, 0.5, 99.5);
  assert.ok(Math.abs(centre.x + 3.675) < 1e-10);
  assert.ok(Math.abs(centre.y + 4.627) < 1e-10);
});

test("rotated image and SVG overlay agree with world coordinates and inverse", () => {
  for (const angle of [0, Math.PI / 2, -0.76, Math.PI]) {
    const map = {
      resolution: 0.025,
      width: 620,
      height: 410,
      origin: [-3.7, 2.4, angle],
    };
    const [a, b, c, d, e, f] = rasterMatrix(map);
    for (const [u, v] of [
      [0, 0],
      [620, 410],
      [221.5, 83.5],
    ]) {
      const world = pixelToWorld(map, u, v),
        pixel = worldToPixel(map, world.x, world.y);
      assert.ok(Math.abs(pixel.u - u) < 1e-9);
      assert.ok(Math.abs(pixel.v - v) < 1e-9);
      assert.ok(Math.abs(a * u + c * v + e - world.x) < 1e-9);
      assert.ok(Math.abs(b * u + d * v + f + world.y) < 1e-9);
    }
  }
});
