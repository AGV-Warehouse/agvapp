const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/pages/maps/scene-builder/floorplan-geometry.js');

test('image pixels with a downward Y axis align to the specified world anchors, scale and rotation', () => {
  const plan = {
    assetId: 'a'.repeat(32), name: 'fab.png', width: 600, height: 400,
    anchorA: { u: 100, v: 150 }, anchorB: { u: 300, v: 250 }, distanceM: 10,
    origin: { x: 24, y: -8 }, headingDeg: 90,
  };
  assert.equal(G.validate(plan), '');
  const t = G.transform(plan);
  const a = G.toWorld(t, plan.anchorA), b = G.toWorld(t, plan.anchorB);
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
  close(a.x, 24); close(a.y, -8); close(b.x, 24); close(b.y, 2);
  const pixel = G.toPixel(t, { x: 24, y: 2 });
  close(pixel.u, 300); close(pixel.v, 250);
  assert.ok(G.validate({ ...plan, anchorB: plan.anchorA }));
  assert.ok(G.validate({ ...plan, anchorB: { u: 600, v: 250 } }));
});
