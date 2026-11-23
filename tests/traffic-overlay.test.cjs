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

test('live case: the held point inside a requested set is found (LAB-03 waits for P-3)', () => {
  const lab01 = {id: 'LAB-01', online: true, task: 'a', status: 'EXECUTING', allocated: ['R-1', 'P-2', 'P-3', 'R-2'], claimed: ['P-7']};
  const lab03 = {id: 'LAB-03', online: true, task: 'b', status: 'EXECUTING', allocated: ['R-3', 'S-3', 'P-4'], claimed: ['R-3:reverse', 'P-3', 'R-2:reverse', 'P-2']};
  assert.equal(T.status(lab03, [lab01, lab03], []).text, '等待 LAB-01 让出 P-3');
});

test('only the next ungranted step can hold a vehicle up, not a resource far ahead', () => {
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', allocated: ['P-1'], claimed: ['R-1', 'P-2', 'R-2', 'P-3']};
  const b = {id: 'LAB-02', online: true, allocated: ['P-3']};
  assert.deepEqual(T.nextClaim(a), ['R-1', 'P-2']);
  assert.equal(T.blockingResource(a, [a, b]), null);
  assert.equal(T.status(a, [a, b], []).text, '执行中');
});

test('a held member of a single-vehicle zone blocks the other members of that zone', () => {
  const blocks = [{id: 'ZONE-1', type: 'SINGLE_VEHICLE_ONLY', members: ['P-2', 'P-3', 'R-2']},
    {id: 'SAME', type: 'SAME_DIRECTION_ONLY', members: ['P-5', 'P-6']}];
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', allocated: ['P-1'], claimed: ['R-1', 'P-2']};
  const b = {id: 'LAB-02', online: true, allocated: ['P-3']};
  assert.deepEqual(T.blockingResource(a, [a, b], blocks), {resource: 'P-2', holder: 'LAB-02', zone: 'ZONE-1'});
  const model = {blocks, points: [{id: 'P-2', label: '二号路口'}]};
  assert.equal(T.status(a, [a, b], [], {model, placeName: id => model.points.find(p => p.id === id)?.label}).text,
    '等待 LAB-02 通过 二号路口 路口');
  const c = {id: 'LAB-03', online: true, task: 'o3', status: 'EXECUTING', allocated: [], claimed: ['P-5']};
  assert.equal(T.blockingResource(c, [c, {id: 'LAB-04', allocated: ['P-6']}], blocks), null);
});

test('resource names read as places: wait points, lanes between places, labels', () => {
  const model = {paths: [{id: 'R-3:reverse', source: 'P-3', target: 'P-4~hold'}, {id: 'R-9', label: '主通道', source: 'A', target: 'B'}]};
  const placeName = id => ({'P-3': '三号路口', 'P-4': '四号工位'})[id];
  assert.equal(T.resourceLabel('P-4~hold', {model, placeName}), '四号工位 前等待点');
  assert.equal(T.resourceLabel('R-3:reverse', {model, placeName}), '三号路口 → 四号工位 前等待点 路段');
  assert.equal(T.resourceLabel('R-9', {model, placeName}), '主通道');
  assert.equal(T.resourceLabel('X-1', {model, placeName}), 'X-1');
  assert.equal(T.resourceLabel('P-1~hold', {model: {points: [{id: 'P-1~hold', label: '待料起点 路口前等待点'}]}, placeName}), '待料起点 路口前等待点');
});

test('a vehicle waiting for operator confirmation says so on the map', () => {
  const robot = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', stationWork: {station: 'S-2', kind: 'pick', needsOperator: true, atStation: true}};
  const s = T.status(robot, [robot], [], {placeName: id => (id === 'S-2' ? '取料口' : id)});
  assert.equal(s.text, '在 取料口 等待操作员确认');
  assert.equal(s.level, 'warn');
  assert.equal(T.status({...robot, stationWork: {station: 'S-5', kind: 'charge', atStation: true}}, [robot], []).text, '在 S-5 充电');
});

test('render outlines the requested next step apart from held resources', () => {
  const points = new Map([['P-1', [0, 0]], ['P-2', [60, 0]]]);
  const paths = new Map([['R-1', [[0, 0], [60, 0]]]]);
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', allocated: ['P-1'], claimed: ['R-1', 'P-2']};
  const svg = T.render({robots: [a], orders: [], geometry: {points, paths}});
  assert.match(svg, /class="traffic-held"[^>]*><title>LAB-01 占用 P-1/);
  assert.equal((svg.match(/traffic-claimed/g) || []).length, 2);
  assert.match(svg, /已申请、尚未获准 R-1/);
});

test('a vehicle still driving granted path toward its wait point is not shown as waiting yet', () => {
  const order = {name: 'o3', state: 'BEING_PROCESSED', currentDriveOrderIndex: 0, currentRouteStepIndex: -1,
    driveOrders: [{route: {steps: [
      {path: 'R-8~spur:reverse', sourcePoint: 'P-8', destinationPoint: 'P-8~hold'},
      {path: 'R-8:reverse', sourcePoint: 'P-8~hold', destinationPoint: 'P-2'}]}}]};
  const model = {blocks: [{id: 'Z', type: 'SINGLE_VEHICLE_ONLY', members: ['P-2', 'P-3', 'R-8:reverse']}],
    points: [{id: 'P-2', label: '通行点一'}, {id: 'P-8~hold', label: '停车位 路口前等待点'}]};
  const placeName = id => model.points.find(p => p.id === id)?.label || id;
  const a = {id: 'LAB-03', online: true, task: 'o3', status: 'EXECUTING', location: 'P-8',
    allocated: ['P-8', 'R-8~spur:reverse', 'P-8~hold'], claimed: ['R-8:reverse', 'P-2']};
  const b = {id: 'LAB-01', online: true, allocated: ['P-3']};
  const driving = T.status(a, [a, b], [order], {model, placeName});
  assert.equal(driving.level, 'info');
  assert.equal(driving.text, '前往 停车位 路口前等待点，到后等待 LAB-01 通过 通行点一 路口');
  const there = T.status({...a, location: 'P-8~hold', allocated: ['P-8~hold']}, [a, b], [order], {model, placeName});
  assert.equal(there.level, 'warn');
  assert.equal(there.text, '等待 LAB-01 通过 通行点一 路口');
});

test('a claim for the leg after the station work is not a wait while the stop is still granted', () => {
  const order = {name: 'o1', state: 'BEING_PROCESSED', currentDriveOrderIndex: 0, currentRouteStepIndex: -1,
    driveOrders: [{route: {steps: [{path: 'R-7~spur', sourcePoint: 'P-7~hold', destinationPoint: 'P-7'}]}},
      {route: {steps: [{path: 'R-7~spur:reverse', sourcePoint: 'P-7', destinationPoint: 'P-7~hold'}, {path: 'R-7:reverse', sourcePoint: 'P-7~hold', destinationPoint: 'P-3'}]}}]};
  const model = {blocks: [{id: 'Z', type: 'SINGLE_VEHICLE_ONLY', members: ['P-2', 'P-3', 'R-7:reverse', 'R-7~spur:reverse']}], points: [{id: 'P-3', label: '通行点二'}, {id: 'P-2'}]};
  const a = {id: 'LAB-01', online: true, task: 'o1', status: 'EXECUTING', location: 'P-7~hold',
    allocated: ['P-7~hold', 'R-7~spur', 'P-7'], claimed: ['R-7~spur:reverse', 'R-7:reverse', 'P-3']};
  const b = {id: 'LAB-02', online: true, allocated: ['P-2']};
  assert.equal(T.status(a, [a, b], [order], {model}).text, '执行中');
  const after = {...a, location: 'P-7', allocated: ['P-7']};
  const order2 = {...order, currentDriveOrderIndex: 1};
  assert.equal(T.status(after, [after, b], [order2], {model, placeName: id => model.points.find(p => p.id === id)?.label || id}).text,
    '等待 LAB-02 通过 通行点二 路口');
});
