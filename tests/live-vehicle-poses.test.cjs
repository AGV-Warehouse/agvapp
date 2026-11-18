const test = require("node:test");
const assert = require("node:assert/strict");
const { monitor, view, svgRotation } = require("../live-vehicle-poses.js");

const sample = { x: 1.25, y: -3, yaw: Math.PI / 2, frame: "map", source: "FLEET_BRIDGE_TF", validForSeconds: 1.2 };
const payload = {
  releaseId: "r6", frame: "map", positionUnits: "m", yawUnits: "rad",
  vehicles: [{ id: "LAB-01", estimatedPose: sample, groundTruthPose: null, truthReason: "FRAME_MISMATCH" }],
};

test("renders a same-version estimate until its actual evidence expires", () => {
  const snapshot = { payload, requestedAt: 1000 };
  assert.deepEqual(view(snapshot, "r6", 2000).vehicles[0].estimate, sample);
  assert.equal(view(snapshot, "r6", 2000).vehicles[0].truth, null);
  assert.match(view(snapshot, "r6", 2000).vehicles[0].truthText, /未与当前地图对齐/);
  assert.equal(view(snapshot, "r6", 2200).vehicles[0].estimate, null);
  assert.match(view(snapshot, "r6", 2200).vehicles[0].estimateText, /过期/);
  assert.deepEqual(view(snapshot, "r5", 2000).vehicles, []);
  assert.equal(svgRotation(sample.yaw), -90);
});

test("keeps truth and estimate independent and rejects positions off the map frame", () => {
  const truth = { ...sample, source: "GAZEBO_POSE_PUBLISHER", x: 1.3 };
  const snapshot = { payload: { ...payload, vehicles: [
    { id: "LAB-01", estimatedPose: { ...sample, frame: "odom" }, groundTruthPose: truth },
    { id: "LAB-02", estimatedPose: { ...sample, source: "AMCL" } },
  ] }, requestedAt: 1000 };
  const [first, second] = view(snapshot, "r6", 1100).vehicles;
  assert.equal(first.estimate, null);
  assert.deepEqual(first.truth, truth);
  assert.match(first.truthText, /仿真真值/);
  assert.match(second.estimateText, /AMCL 定位估计/);
});

test("guest pose evidence must match both the current published release and map", () => {
  const map = {releaseId:"r6", mapId:"scene-db575bcffa0116a5"};
  const snapshot = {payload:{...payload,mapId:map.mapId},requestedAt:1000};
  assert.equal(view(snapshot,map,1100).vehicles[0].estimate,sample);
  assert.deepEqual(view(snapshot,{...map,mapId:"other"},1100).vehicles,[]);
  assert.deepEqual(view(snapshot,{...map,releaseId:"r5"},1100).vehicles,[]);
});

test("scoped polling aborts on navigation and discards delayed evidence", async () => {
  let active = "deployment";
  let time = 0;
  let resolveRequest;
  let signal;
  let requests = 0;
  const poll = monitor({
    active: () => active, now: () => time, onChange() {},
    request: (value) => {
      requests++;
      signal = value;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
  });
  const pending = poll.tick();
  time = 800;
  await poll.tick();
  assert.equal(requests, 1);
  active = null;
  await poll.tick();
  assert.equal(signal.aborted, true);
  resolveRequest(payload);
  await pending;
  assert.equal(poll.snapshot(), null);
  active = "deployment";
  const next = poll.tick();
  resolveRequest(payload);
  await next;
  assert.equal(poll.snapshot().payload, payload);
});
