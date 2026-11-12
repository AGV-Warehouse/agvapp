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
// Boxes -> world rects: cell edges, not cell centres, and y is not flipped
// (data row 0 is already the bottom of the map).
const rects = boxesToWorldRects({ resolution: 0.5, originX: -1, originY: -2 }, [{ col0: 2, row0: 4, col1: 3, row1: 4 }]);
assert.deepStrictEqual(rects, [0, 0, 1, 0.5]);

// Path: only the part ahead of the robot, and nothing once it has arrived.
const line = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
assert.deepStrictEqual(pathAhead(line, { x: 1.1, y: 0.2 }), [{ x: 1.1, y: 0.2 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
assert.deepStrictEqual(pathAhead(line, { x: 2.95, y: 0 }), [], "arrived");
assert.deepStrictEqual(pathAhead([], { x: 0, y: 0 }), []);
assert.strictEqual(pathAhead(line, null), line, "no pose yet: whole path");
// Goal overlay: what the map shows when Nav2 has no path to draw.
const at0 = { x: 0, y: 0 };
const g = (extra) => ({ x: 2, y: 0, sentAt: 0, planAt: null, failed: false, ...extra });
const straightLine = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
assert.deepStrictEqual(goalOverlay(null, [], at0, 0), { line: [], style: null, note: "" }, "idle");
assert.strictEqual(goalOverlay(null, line, { x: 1.1, y: 0.2 }, 0).style, "plan", "plan from RViz, no app goal");
let o = goalOverlay(g(), [], at0, 1000);
assert.strictEqual(o.style, "waiting");
assert.deepStrictEqual(o.line, straightLine, "waiting: straight robot-to-goal line");
o = goalOverlay(g(), [], at0, PLAN_STALE_MS + 2000);
assert.strictEqual(o.style, "stuck", "no plan after PLAN_STALE_MS");
assert.ok(/No path after 5 s/.test(o.note), o.note);
o = goalOverlay(g({ failed: true }), line, at0, 0);
assert.strictEqual(o.style, "failed");
assert.deepStrictEqual(o.line, straightLine, "failed: straight line even if an old plan is cached");
o = goalOverlay(g({ planAt: 1000 }), line, { x: 1.1, y: 0.2 }, 1500);
assert.strictEqual(o.style, "plan");
assert.strictEqual(o.line.length, 3, "fresh plan: the part ahead");
assert.strictEqual(goalOverlay(g({ planAt: 1000 }), line, { x: 1.1, y: 0.2 }, 1000 + PLAN_STALE_MS + 1).style, "stale");
assert.deepStrictEqual(goalOverlay(g({ planAt: 1000 }), line, { x: 2.95, y: 0 }, 1500), { line: [], style: null, note: "Arriving..." });

const st = (uuid, sec, status) => ({ goal_info: { goal_id: { uuid }, stamp: { sec, nanosec: 0 } }, status });
assert.strictEqual(latestGoalStatus([]), null);
assert.deepStrictEqual(latestGoalStatus([st([1, 2], 10, 4), st([3, 4], 20, 6), st([5], 15, 2)]), { id: "3,4", status: 6 }, "newest by stamp");

console.log("map.test.js: PASS");
