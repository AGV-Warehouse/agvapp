// node test/map.test.js -- checks classifyMap() on a synthetic grid.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "map.js"), "utf8"));

const resolution = 0.05;
const width = 120;
const height = 120;
const data = new Int8Array(width * height).fill(0);
const set = (col, row) => (data[row * width + col] = 100);
const at = (col, row) => row * width + col;

for (let col = 0; col < width; col++) set(col, 0); // solid wall
for (let col = 10; col < 50; col += 3) { set(col, 30); set(col + 1, 30); } // wall with 5 cm gaps
[[10, 60], [19, 60], [10, 69], [19, 69]].forEach(([c, r]) => set(c, r)); // chair, legs 0.45 m apart
set(114, 114); // lone post
for (let col = 40; col < 110; col += 6) set(col, 90); // dots every 0.3 m over 3.5 m: must not chain into one box
data[at(5, 110)] = -1; // unknown is not an obstacle

const s = MAP_DETECTION_DEFAULTS;
const { cellClass, boxes } = classifyMap({ info: { resolution, width, height }, data }, s);

assert.strictEqual(cellClass[at(60, 0)], CELL_WALL, "solid wall");
assert.strictEqual(cellClass[at(10, 30)], CELL_WALL, "broken wall joins into one wall");
assert.strictEqual(cellClass[at(10, 60)], CELL_OBJECT, "chair leg");
assert.strictEqual(cellClass[at(114, 114)], CELL_SPECK, "lone post");
assert.strictEqual(cellClass[at(5, 110)], CELL_NONE, "unknown cell");

const chair = boxes.find((b) => b.col0 <= 10 && b.col1 >= 19 && b.row0 <= 60 && b.row1 >= 69);
assert.ok(chair, "chair has a box");
assert.strictEqual(chair.dots, 4);
const marginCells = Math.round(OBJECT_BOX_MARGIN_M / resolution);
boxes.forEach((b) => {
  const diag = Math.hypot(b.col1 - b.col0 + 1 - 2 * marginCells, b.row1 - b.row0 + 1 - 2 * marginCells) * resolution;
  assert.ok(diag <= s.objectMaxSize + 1e-9, `box larger than objectMaxSize: ${diag} m`);
});
assert.ok(boxes.filter((b) => b.row0 <= 90 && b.row1 >= 90).length >= 3, "dot line split into several boxes");

// Every setting at its extremes still runs.
classifyMap({ info: { resolution, width, height }, data }, { wallGap: 0, wallMinLength: 0.3, objectLink: 0, objectMaxSize: 0.3, objectMinDots: 1 });
classifyMap({ info: { resolution, width, height }, data }, { wallGap: 0.4, wallMinLength: 4, objectLink: 1.2, objectMaxSize: 3, objectMinDots: 8 });
console.log("map.test.js: PASS");
