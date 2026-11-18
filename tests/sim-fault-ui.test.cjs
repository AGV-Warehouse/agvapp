const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../src/pages/simulation/fault-ui.js');

const robot = (over = {}) => ({
  robotId: 'robot-1',
  vehicleName: 'LAB-01',
  requested: null,
  applied: { eStop: false, fieldViolation: false, batteryPercent: null },
  confirmed: false,
  ...over,
});

test('badges show what the robot reported, not what was requested', () => {
  assert.match(UI.badges(robot()), /正常/);
  const waiting = robot({ requested: { eStop: true, fieldViolation: false, batteryPercent: null } });
  assert.match(UI.badges(waiting), /正常/);
  assert.match(UI.badges(waiting), /等待车辆确认/);
  const stopped = robot({
    requested: { eStop: true, fieldViolation: false, batteryPercent: 20 },
    applied: { eStop: true, fieldViolation: false, batteryPercent: 20 },
    confirmed: true,
  });
  assert.match(UI.badges(stopped), /仿真急停中/);
  assert.match(UI.badges(stopped), /电量 20%/);
  assert.doesNotMatch(UI.badges(stopped), /等待车辆确认/);
  assert.match(UI.badges(robot({ applied: null })), /车辆状态未知/);
});

test('robot card offers engage or release depending on the request, and read-only disables it', () => {
  const card = UI.robotCard(robot(), true);
  assert.match(card, /data-fault-set="eStop" data-fault-value="true"/);
  assert.match(card, /仿真急停/);
  const engaged = UI.robotCard(
    robot({ requested: { eStop: true, fieldViolation: true, batteryPercent: 10 } }),
    true,
  );
  assert.match(engaged, /解除急停/);
  assert.match(engaged, /清除区域侵入/);
  assert.match(engaged, /value="10"/);
  assert.match(UI.robotCard(robot(), false), /disabled/);
  assert.doesNotMatch(UI.robotCard(robot({ vehicleName: '<img>' }), true), /<img>/);
});

test('history lists changes in plain words', () => {
  const html = UI.historyList([
    { recordedAt: 't', vehicleName: 'LAB-02', changes: { eStop: true, batteryPercent: null } },
  ]);
  assert.match(html, /LAB-02：急停、电量 95%（默认）/);
  assert.match(UI.historyList([]), /尚无故障记录/);
});

test('parseValue only accepts the three button values', () => {
  assert.equal(UI.parseValue('true'), true);
  assert.equal(UI.parseValue('false'), false);
  assert.equal(UI.parseValue('null'), null);
  assert.throws(() => UI.parseValue('1'));
});

function fakeContainer() {
  const listeners = {};
  return {
    hidden: false,
    innerHTML: '',
    contains: () => false,
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    fire(type, event) {
      return listeners[type](event);
    },
  };
}

function fakeApi(responses) {
  const calls = [];
  return {
    calls,
    authorized: true,
    deploymentConfirmed: true,
    receiptSnapshot: () => ({ canWrite: true }),
    id: () => 'req-1',
    async request(path, body) {
      calls.push([path, body]);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const status = {
  enabled: true,
  catalog: [{ id: 'eStop', label: '仿真急停', effect: '车辆立即停车' }],
  robots: [robot()],
  history: [],
};

test('mount reads status, sends an e-stop and refreshes', async () => {
  const container = fakeContainer();
  const api = fakeApi([status, { requestId: 'req-1' }, status]);
  const view = UI.mount(container, api, { initialVisible: false });
  await view.refresh();
  assert.match(container.innerHTML, /LAB-01/);
  assert.match(container.innerHTML, /车辆立即停车/);
  const button = { disabled: false, dataset: { faultRobot: 'robot-1', faultSet: 'eStop', faultValue: 'true' } };
  container.fire('click', { target: { closest: () => button } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(api.calls[1], ['sim/faults', { requestId: 'req-1', robotId: 'robot-1', changes: { eStop: true } }]);
  assert.equal(api.calls.length, 3);
  view.destroy();
});

test('mount hides itself where the environment has no fault injection', async () => {
  const container = fakeContainer();
  let supported = null;
  const error = Object.assign(new Error('no'), { code: 'SIM_FAULT_SCOPE' });
  const view = UI.mount(container, fakeApi([error]), {
    onSupportChange: (value) => {
      supported = value;
    },
  });
  await view.refresh();
  assert.equal(container.hidden, true);
  assert.equal(supported, false);
  view.destroy();
});
