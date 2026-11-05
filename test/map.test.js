// node test/map.test.js -- checks findFurnitureBoxes() on a synthetic grid.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "map.js"), "utf8"));

const resolution = 0.05;
const width = 100;
const height = 100;
const data = new Int8Array(width * height).fill(0);
const set = (col, row, value = 100) => (data[row * width + col] = value);

for (let col = 0; col < width; col++) set(col, 0); // wall: never boxed
[[10, 10], [19, 10], [10, 19], [19, 19]].forEach(([c, r]) => set(c, r)); // chair, 0.45 m
[[60, 60], [61, 60]].forEach(([c, r]) => set(c, r)); // a 2-cell leg is still one leg -> lone post
set(80, 80); // lone post
[[40, 40], [52, 40]].forEach(([c, r]) => set(c, r)); // 0.55 m gap: linked
[[40, 80], [54, 80]].forEach(([c, r]) => set(c, r)); // 0.65 m gap: not linked
set(30, 90, -1); // unknown cells are not obstacles

const boxes = findFurnitureBoxes({ info: { resolution, width, height }, data });
const margin = 2; // 0.1 m / 0.05
assert.deepStrictEqual(
  boxes.map((b) => [b.col0, b.row0, b.col1, b.row1, b.legs]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  [
    [10 - margin, 10 - margin, 19 + margin, 19 + margin, 4],
    [40 - margin, 40 - margin, 52 + margin, 40 + margin, 2],
  ],
);
console.log("map.test.js: PASS");
