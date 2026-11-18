(function (root) {
  "use strict";

  const clock = () => root.performance?.now() ?? Date.now();
  const statusText = {
    NO_RELEASE: "当前没有已确认发布的仿真版本。",
    SOURCE_UNAVAILABLE: "仿真位置源暂不可用。",
    RELEASE_MISMATCH: "位置源与当前发布版本或会话不一致。",
    MAP_PENDING: "等待当前位置与已显示地图的版本核对。",
    AUTH_REQUIRED: "验证本页权限后可读取仿真车辆位置。",
    WAITING: "正在读取仿真车辆位置。",
  };
  const reasonText = {
    STALE: "源数据已过期",
    FRAME_MISMATCH: "坐标系未与当前地图对齐",
    MISSING: "源未提供",
    SOURCE_UNAVAILABLE: "位置源暂不可用",
  };
  const sourceText = {
    FLEET_BRIDGE_TF: "Fleet Bridge 定位估计",
    AMCL: "AMCL 定位估计",
    GAZEBO_POSE_PUBLISHER: "Gazebo 仿真真值",
  };

  function currentSample(sample, requestedAt, now) {
    if (sample?.frame !== "map" || !sourceText[sample.source]) return null;
    if (![sample.x, sample.y, sample.yaw, sample.validForSeconds].every(Number.isFinite)) return null;
    const age = (now - requestedAt) / 1000;
    return age >= 0 && age < Math.min(2, sample.validForSeconds) ? sample : null;
  }

  function view(snapshot, mapRelease, now = clock()) {
    if (!snapshot) return { vehicles: [], message: statusText.WAITING };
    const { payload, requestedAt } = snapshot;
    if (payload.reason) return { vehicles: [], message: statusText[payload.reason] || statusText.SOURCE_UNAVAILABLE };
    if (payload.frame !== "map" || payload.positionUnits !== "m" || payload.yawUnits !== "rad")
      return { vehicles: [], message: statusText.SOURCE_UNAVAILABLE };
    const releaseId = typeof mapRelease === 'string' ? mapRelease : mapRelease?.releaseId;
    if (!releaseId || payload.releaseId !== releaseId ||
        (typeof mapRelease === 'object' && payload.mapId !== mapRelease.mapId))
      return { vehicles: [], message: statusText.MAP_PENDING };
    const vehicles = (Array.isArray(payload.vehicles) ? payload.vehicles : []).map((vehicle) => {
      const estimatedPose = vehicle.estimatedPose;
      const estimate = estimatedPose?.source === "FLEET_BRIDGE_TF" || estimatedPose?.source === "AMCL"
        ? currentSample(estimatedPose, requestedAt, now) : null;
      const truth = vehicle.groundTruthPose?.source === "GAZEBO_POSE_PUBLISHER"
        ? currentSample(vehicle.groundTruthPose, requestedAt, now) : null;
      return {
        id: vehicle.id, estimate, truth,
        estimateText: estimate ? sourceText[estimate.source] :
          "估计位置隐藏，" + (reasonText[vehicle.estimatedPose ? "STALE" : vehicle.estimateReason] || reasonText.MISSING),
        truthText: truth ? sourceText[truth.source] :
          "仿真真值隐藏，" + (reasonText[vehicle.groundTruthPose ? "STALE" : vehicle.truthReason] || reasonText.MISSING),
      };
    });
    return { vehicles, message: vehicles.length ? "" : statusText.SOURCE_UNAVAILABLE };
  }

  function monitor({ request, active, onChange, now = clock }) {
    let snapshot = null;
    let pending = null;
    let nextAt = 0;
    let signature = "";
    function publish() {
      const instant = now();
      const nextSignature = JSON.stringify(view(snapshot, snapshot?.payload.releaseId, instant));
      if (signature === nextSignature) return;
      signature = nextSignature;
      onChange();
    }
    async function tick() {
      const context = active();
      if (!context || (pending && pending.context !== context)) {
        pending?.controller.abort();
        pending = null;
      }
      if (!context || (snapshot && snapshot.context !== context)) {
        snapshot = null;
        nextAt = 0;
      }
      publish();
      if (!context || pending || now() < nextAt) return;
      const current = { context, controller: new AbortController() };
      pending = current;
      const requestedAt = now();
      nextAt = requestedAt + 600;
      try {
        const payload = await request(current.controller.signal);
        if (pending === current && active() === context) snapshot = { context, requestedAt, payload };
      } catch (_) {
        if (pending === current && active() === context) {
          snapshot = { context, requestedAt, payload: { reason: "SOURCE_UNAVAILABLE" } };
          nextAt = now() + 1200;
        }
      } finally {
        if (pending === current) pending = null;
        publish();
      }
    }
    return { tick, snapshot: () => snapshot };
  }

  function svgRotation(yaw) {
    return -yaw * 180 / Math.PI;
  }

  const api = { monitor, view, statusText, svgRotation };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LiveVehiclePoses = api;
})(typeof window === "undefined" ? globalThis : window);
