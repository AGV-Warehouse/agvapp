const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/pages/operations/map-3d.js');
const T = require('../src/pages/operations/traffic-overlay.js');

const model = {
  points: [{id: 'P-1', x: 0, y: 0}, {id: 'P-2', x: 2, y: 0}, {id: 'P-3', x: 2, y: 1}, {id: 'P-3~hold', x: 2, y: 0.8}],
  paths: [
    {id: 'R-1', source: 'P-1', target: 'P-2'},
    {id: 'R-2', source: 'P-2', target: 'P-3', connectionType: 'BEZIER', controlPoints: [{x: 3, y: 0.5}]},
    {id: 'R-X', source: 'P-1', target: 'NOWHERE'},
  ],
  stations: [{id: 'S-1', label: '取料口', x: 2, y: 1.5, links: ['P-3']}],
};

test('path lines follow the model in metres, curves sampled, dangling paths skipped', () => {
  const {lines} = M.pathLines(model);
  assert.deepEqual(lines.get('R-1'), [[0, 0], [2, 0]]);
  assert.equal(lines.get('R-2').length, 13);
  assert.deepEqual(lines.get('R-2')[6], [2.5, 0.5]);
  assert.equal(lines.has('R-X'), false);
  assert.deepEqual(M.bounds(model), {minX: 0, maxX: 2, minY: 0, maxY: 1.5});
  assert.deepEqual(M.bounds({}), {minX: -2, maxX: 2, minY: -2, maxY: 2});
});

test('describe draws the same routes, held and requested resources and waits as 2D', () => {
  const order = {name: 'o1', state: 'BEING_PROCESSED', currentDriveOrderIndex: 0, currentRouteStepIndex: 0,
    driveOrders: [{route: {steps: [{path: 'R-1', sourcePoint: 'P-1', destinationPoint: 'P-2'}, {path: 'R-2', sourcePoint: 'P-2', destinationPoint: 'P-3'}]}}]};
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', location: 'P-1', allocated: ['P-1'], claimed: ['R-1', 'P-2']};
  const b = {id: 'LAB-02', online: true, allocated: ['P-2']};
  const view = M.describe({model, robots: [a, b], orders: [order], traffic: T,
    poses: [{id: 'LAB-01', x: 0, y: 0, yaw: 0.5}, {id: 'LAB-02', x: 2, y: 0}, {id: 'GHOST', x: 1, y: 1}]});
  assert.equal(view.routes.length, 1);
  assert.equal(view.routes[0].segments.length, 2);
  assert.deepEqual(view.routes[0].end, [2, 1]);
  assert.deepEqual(view.held.map(h => [h.id, h.name]), [['LAB-01', 'P-1'], ['LAB-02', 'P-2']]);
  assert.deepEqual(view.claimed.map(h => h.name), ['R-1', 'P-2']);
  const lab01 = view.vehicles.find(v => v.id === 'LAB-01');
  assert.equal(lab01.yaw, 0.5);
  assert.equal(lab01.note.text, '等待 LAB-02 让出 P-2');
  assert.equal(view.vehicles.find(v => v.id === 'LAB-02').note, null);
  assert.equal(view.vehicles.find(v => v.id === 'GHOST').color, '#8a94a6');
  assert.deepEqual(view.points.map(p => p.id), ['P-1', 'P-2', 'P-3']);
  assert.equal(view.stations[0].label, '取料口');
});

test('without fleet data only the plant and poses are drawn', () => {
  const view = M.describe({model, robots: [], orders: [], traffic: T, poses: [{id: 'LAB-01', x: 0, y: 0}]});
  assert.equal(view.routes.length + view.held.length + view.claimed.length, 0);
  assert.equal(view.vehicles.length, 1);
  assert.equal(view.vehicles[0].yaw, null);
  assert.equal(M.layoutKey(view), M.layoutKey(M.describe({model, poses: []})));
});

test('angles turn the short way', () => {
  assert.ok(Math.abs(M.lerpAngle(3.0, -3.0, 1) - (3.0 + (2 * Math.PI - 6))) < 1e-9);
  assert.ok(Math.abs(M.lerpAngle(0, 1, 0.5) - 0.5) < 1e-9);
});
