const test = require("node:test");
const assert = require("node:assert/strict");
const OV = require("../src/shell/operator-view.js");
const HomePanels = require("../src/shell/home-panels.js");

const layout = { points: [{ id: "S-1", name: "待料缓冲位", destination: "S-1" }] };
const model = { points: [{ id: "P-7", label: "空闲停车位" }], stations: [] };
const order = (name, state, extra = {}) => ({
  name, state, creationTime: "2026-11-20T07:40:00Z",
  driveOrders: [{ destination: { destination: "S-1" } }], ...extra,
});

test("vehicle status speaks in operator words, most serious first", () => {
  const robot = { id: "LAB-01", online: true, status: "IDLE" };
  assert.equal(OV.vehicleStatus(robot, { connected: false }).label, "信号中断");
  assert.equal(OV.vehicleStatus({ ...robot, online: false }).label, "离线");
  assert.equal(OV.vehicleStatus({ ...robot, status: "ERROR" }).label, "故障");
  assert.equal(OV.vehicleStatus({ ...robot, paused: true }).label, "已暂停");
  assert.equal(OV.vehicleStatus(robot, { waiting: { "LAB-01": "等待 LAB-02 让路" } }).label, "等待 LAB-02 让路");
  const moving = OV.vehicleStatus({ ...robot, status: "EXECUTING", task: "o1" }, { orders: [order("o1", "BEING_PROCESSED")], layout });
  assert.deepEqual(moving, { label: "前往 待料缓冲位", tone: "moving" });
  assert.equal(OV.vehicleStatus(robot).label, "空闲");
  assert.equal(OV.batteryText({ battery: null }), "—");
  assert.equal(OV.batteryText({ battery: 87.4 }), "87%");
});

test("place names come from the layout or plant model, never raw ids when a name exists", () => {
  assert.equal(OV.placeName("S-1", { layout, model }), "待料缓冲位");
  assert.equal(OV.placeName("P-7", { layout, model }), "空闲停车位");
  assert.equal(OV.placeName("P-9", { layout, model }), "P-9");
});

test("task queue lists active tasks oldest first and a few recent finished ones", () => {
  const orders = [
    order("a", "FINISHED", { finishedTime: "2026-11-20T07:50:00Z" }),
    order("b", "BEING_PROCESSED", { processingVehicle: "LAB-01", creationTime: "2026-11-20T07:45:00Z" }),
    order("c", "DISPATCHABLE", { creationTime: "2026-11-20T07:41:00Z" }),
  ];
  const queue = OV.taskQueue(orders, { layout });
  assert.deepEqual(queue.active.map((r) => r.id), ["c", "b"]);
  assert.equal(queue.active[0].detail, "等待空闲车辆");
  assert.equal(queue.active[1].detail, "前往 待料缓冲位");
  assert.deepEqual(queue.recent.map((r) => [r.id, r.state]), [["a", "已完成"]]);
});

test("exceptions combine connection, vehicle, failed task and server alerts without duplicates", () => {
  const recent = new Date().toISOString();
  const items = OV.exceptions({
    received: true, connected: true,
    robots: [{ id: "LAB-01", online: false }, { id: "LAB-02", online: true, paused: true }],
    orders: [order("f", "FAILED", { processingVehicle: "LAB-03", finishedTime: recent })],
    alerts: [{ level: "warning", vehicleId: "LAB-04", message: "电量低" }],
    context: { layout },
  });
  assert.equal(items[0].level, "alert");
  assert.ok(items.some((i) => i.vehicle === "LAB-01" && i.text === "离线"));
  assert.ok(items.some((i) => i.vehicle === "LAB-03" && /失败/.test(i.text)));
  assert.ok(items.some((i) => i.vehicle === "LAB-04" && i.text === "电量低" && i.level === "warn"));
  assert.ok(items.some((i) => i.vehicle === "LAB-02" && i.level === "warn"));
  assert.deepEqual(OV.exceptions({ received: false }), []);
});

test("home panels escape text and keep raw ids behind an engineering-only details", () => {
  const html = HomePanels.taskMarkup({ id: "fleet-<x>", vehicle: "LAB-01", to: "<b>", detail: "执行中", tone: "moving", active: true, created: null }, () => "—");
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<details class="task-raw eng-only">/);
  assert.equal(HomePanels.attentionMarkup([]), '<li class="attention-empty">一切正常</li>');
});

test("dates use one unambiguous format", () => {
  assert.match(OV.formatTime("2020-01-02T03:04:00"), /^2020-01-02 03:04$/);
  assert.equal(OV.formatTime("nope"), "—");
});

test("pickup/drop-off tasks read their steps and ask the operator to confirm at the station", () => {
  const order = {
    name: "fleet-1", state: "BEING_PROCESSED", processingVehicle: "LAB-01", currentDriveOrderIndex: 0,
    driveOrders: [
      { destination: { destination: "S-1", operation: "pick" }, state: "OPERATING" },
      { destination: { destination: "S-3", operation: "drop" }, state: "PRISTINE" },
    ],
  };
  const steps = OV.taskSteps(order);
  assert.deepEqual(steps.map((s) => [s.station, s.kind, s.current]), [["S-1", "pick", true], ["S-3", "drop", false]]);
  const robots = [{ id: "LAB-01", online: true, task: "fleet-1", status: "EXECUTING",
    stationWork: { orderId: "fleet-1", station: "S-1", kind: "pick", atStation: true, needsOperator: true } }];
  const row = OV.orderSummary(order, { layout, robots });
  assert.equal(row.to, "待料缓冲位 取货 → S-3 送货");
  assert.equal(row.detail, "在 待料缓冲位 等待确认：取货");
  assert.deepEqual(row.confirm, { robotId: "LAB-01", label: "取货完成" });
  assert.equal(OV.vehicleStatus(robots[0], { layout }).label, "在 待料缓冲位 等待确认：取货");
  const items = OV.exceptions({ received: true, connected: true, robots, alertsSupported: true, context: { layout } });
  assert.equal(items[0].confirm.robotId, "LAB-01");
});

test("gateway alerts replace derived offline/failed items and can be acknowledged", () => {
  const items = OV.exceptions({
    received: true, connected: true, alertsSupported: true,
    robots: [{ id: "LAB-01", online: false }],
    orders: [order("f", "FAILED", { finishedTime: new Date().toISOString() })],
    alerts: [{ id: "OFFLINE:LAB-01", kind: "OFFLINE", severity: "critical", robotId: "LAB-01", title: "LAB-01 离线", detail: "检查电源", acknowledged: false },
      { id: "LOW_BATTERY:LAB-02", kind: "LOW_BATTERY", severity: "warning", robotId: "LAB-02", title: "x", detail: "去充电", acknowledged: true }],
  });
  assert.deepEqual(items.map((i) => [i.vehicle, i.text, i.id]), [["LAB-01", "离线", "OFFLINE:LAB-01"], ["LAB-02", "电量低", "LOW_BATTERY:LAB-02"]]);
  assert.match(HomePanels.attentionMarkup(items, { canOperate: true }), /data-ack-alert="OFFLINE:LAB-01"/);
  assert.doesNotMatch(HomePanels.attentionMarkup(items, { canOperate: true }), /data-ack-alert="LOW_BATTERY/);
  assert.equal(OV.batterySourceText({ batterySource: "SIMULATION_MODEL" }), "仿真模型估算");
});
