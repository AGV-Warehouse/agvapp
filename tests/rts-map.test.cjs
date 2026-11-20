const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Rts = require('../src/pages/operations/rts-map.js');

const fit = {x: -300, y: -200, w: 600, h: 400};

test('zoom keeps the map point under the cursor fixed and respects limits', () => {
  const camera = {x: 0, y: 0, w: 600, h: 400};
  const anchor = {x: 150, y: 100};
  const next = Rts.zoomAt(camera, 0.5, anchor, fit);
  // The anchor sits at the same fraction of the view before and after.
  assert.equal((anchor.x - camera.x) / camera.w, (anchor.x - next.x) / next.w);
  assert.equal((anchor.y - camera.y) / camera.h, (anchor.y - next.y) / next.h);
  assert.equal(next.w, 300);
  assert.equal(Rts.zoomAt({...camera, w: 600 * 0.08, h: 32}, 0.5, null, fit), null);
  assert.equal(Rts.zoomAt({...camera, w: 600 * 12, h: 4800}, 2, null, fit), null);
});

test('camera animation eases to the exact target', () => {
  const a = {x: 0, y: 0, w: 100, h: 100}, b = {x: 10, y: 20, w: 50, h: 50};
  assert.deepEqual(Rts.lerpCamera(a, b, 1), b);
  const mid = Rts.lerpCamera(a, b, 0.5);
  assert.ok(mid.x > 5 && mid.x < 10, 'ease-out is past halfway at t=0.5');
});

test('box select picks vehicles whose centre is inside, in any drag direction', () => {
  const vehicles = [{id: 'A', x: 10, y: 10}, {id: 'B', x: 50, y: 50}, {id: 'C', x: NaN, y: 0}];
  const rect = Rts.normalizedRect({x: 60, y: 60}, {x: 0, y: 0});
  assert.deepEqual(Rts.boxSelect(vehicles, rect), ['A', 'B']);
  assert.deepEqual(Rts.boxSelect(vehicles, Rts.normalizedRect({x: 0, y: 0}, {x: 20, y: 20})), ['A']);
});

test('click replaces the selection, modifier click toggles', () => {
  assert.deepEqual(Rts.clickSelect(['A', 'B'], 'C', false), ['C']);
  assert.deepEqual(Rts.clickSelect(['A'], 'B', true), ['A', 'B']);
  assert.deepEqual(Rts.clickSelect(['A', 'B'], 'A', true), ['B']);
});

test('right-click plan never dispatches without exactly one chosen vehicle and a real destination', () => {
  const destinations = [{id: 'P-S1', destination: 'S-1'}];
  assert.equal(Rts.dispatchPlan('S-9', ['LAB-01'], destinations).kind, 'unavailable');
  assert.equal(Rts.dispatchPlan('S-1', [], destinations).kind, 'no-selection');
  assert.deepEqual(Rts.dispatchPlan('S-1', ['LAB-01'], destinations),
    {kind: 'single', destination: destinations[0], robotId: 'LAB-01'});
  const many = Rts.dispatchPlan('S-1', ['LAB-01', 'LAB-02'], destinations);
  assert.equal(many.kind, 'choose');
  assert.deepEqual(many.robotIds, ['LAB-01', 'LAB-02']);
});

test('the map dispatch shares the form dispatch path and its guards', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.equal((app.match(/api\.order\(/g) || []).length, 1, 'only submitOrder creates orders');
  assert.match(app, /action\(\(\) => submitOrder\(\$\("toPoint"\)\.value\)\)/);
  assert.match(app, /if \(\$\("sendOrderButton"\)\.disabled\) return card\.setStatus/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(index.indexOf('rts-map.js') < index.indexOf('src="app.js"'));
  const assets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web-assets.json'), 'utf8'));
  assert.ok(assets.includes('src/pages/operations/rts-map.js'));
});
