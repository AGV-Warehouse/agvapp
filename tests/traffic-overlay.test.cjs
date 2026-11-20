const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/pages/operations/traffic-overlay.js');

const steps = [
  {path: 'R-7:reverse', sourcePoint: 'P-7', destinationPoint: 'P-3'},
  {path: 'R-2:reverse', sourcePoint: 'P-3', destinationPoint: 'P-2'},
  {path: 'R-1:reverse', sourcePoint: 'P-2', destinationPoint: 'P-1'},
];
const order = (extra = {}) => ({name: 'o1', state: 'BEING_PROCESSED', currentDriveOrderIndex: 0, currentRouteStepIndex: 1,
  driveOrders: [{state: 'TRAVELLING', route: {steps}}], ...extra});

test('remaining route starts at the step openTCS reports, else at the reported point', () => {
  const robot = {id: 'LAB-01', task: 'o1', location: 'P-7'};
  assert.deepEqual(T.remainingRoute(robot, [order()]).map(s => s.path), ['R-2:reverse', 'R-1:reverse']);
  assert.deepEqual(T.remainingRoute(robot, [order({currentRouteStepIndex: -1})]).map(s => s.path), steps.map(s => s.path));
  assert.deepEqual(T.remainingRoute({...robot, location: 'P-2'}, [order({currentRouteStepIndex: -1})]).map(s => s.path), ['R-1:reverse']);
  assert.deepEqual(T.remainingRoute(robot, [order({state: 'FINISHED'})]), []);
  assert.deepEqual(T.remainingRoute({id: 'LAB-01'}, [order()]), []);
});

test('waiting is reported only when another vehicle holds the next claimed resource', () => {
  const a = {id: 'LAB-01', task: 'o1', status: 'EXECUTING', allocated: ['P-3'], claimed: ['P-3', 'R-2', 'P-2']};
  const b = {id: 'LAB-02', allocated: ['R-2']};
  assert.deepEqual(T.blockingResource(a, [a, b]), {resource: 'R-2', holder: 'LAB-02'});
  assert.equal(T.status(a, [a, b], [order()]).text, '等待 LAB-02 让出 R-2');
  assert.equal(T.blockingResource(a, [a, {id: 'LAB-02', allocated: []}]), null);
  assert.equal(T.status(a, [a], [order()]).text, '执行中');
});

test('status ranks offline, error, failed order and pause above waiting', () => {
  assert.equal(T.status({id: 'A', stale: true, paused: true}, [], []).level, 'alert');
  assert.equal(T.status({id: 'A', online: true, status: 'ERROR'}, [], []).text, '车辆报告错误');
  assert.equal(T.status({id: 'A', online: true, task: 'o1'}, [], [order({state: 'FAILED'})]).text, '当前订单失败');
  assert.match(T.status({id: 'A', online: true, paused: true}, [], []).text, /已暂停/);
  assert.equal(T.status({id: 'A', online: true}, [], []), null);
  assert.deepEqual(T.alerts([{id: 'A', online: true}, {id: 'B', online: true, paused: true}], []).map(a => a.id), ['B']);
});

test('render draws route, held resources and the wait note from model geometry only', () => {
  const points = new Map([['P-3', [0, 0]], ['P-2', [60, 0]], ['P-1', [120, 0]]]);
  const paths = new Map([['R-2:reverse', [[0, 0], [60, 0]]], ['R-1:reverse', [[60, 0], [120, 0]]]]);
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', location: 'P-7', allocated: ['P-3'], claimed: ['P-3', 'R-2:reverse']};
  const b = {id: 'LAB-02', online: true, allocated: ['R-2:reverse']};
  const svg = T.render({robots: [a, b], orders: [order()], geometry: {points, paths}, positions: new Map([['LAB-01', [0, 0]]])});
  assert.match(svg, /traffic-route/);
  assert.match(svg, /M0 0 L60 0 M60 0 L120 0/);
  assert.match(svg, /等待 LAB-02 让出 R-2:reverse/);
  assert.match(svg, /traffic-wait-link/);
  assert.doesNotMatch(T.render({robots: [{id: 'X', online: true}], orders: [], geometry: {points, paths}}), /traffic-route/);
});
