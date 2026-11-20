/*
 * Operator-facing wording for vehicles and tasks, plus the engineering-mode switch.
 *
 * The main flow says only what is true now: where a vehicle is going, who it is
 * waiting for, that it arrived, or that it failed and why. Raw states, ids and
 * hashes stay available in engineering mode and in collapsed 详情 sections.
 */
(function (root) {
  "use strict";
  const ENGINEERING_KEY = "agv.portal.engineering";

  const ORDER_STATES = {
    RAW: ["排队中", "queued"],
    ACTIVE: ["排队中", "queued"],
    DISPATCHABLE: ["等待分配车辆", "queued"],
    BEING_PROCESSED: ["执行中", "moving"],
    WITHDRAWN: ["已取消", "muted"],
    FINISHED: ["已完成", "done"],
    FAILED: ["失败", "alert"],
    UNROUTABLE: ["无法规划路线", "alert"],
  };
  const ACTIVE_ORDER_STATES = new Set(["RAW", "ACTIVE", "DISPATCHABLE", "BEING_PROCESSED"]);

  /** Readable name for a point or station id, from the layout and plant model. */
  function placeName(id, { layout, model } = {}) {
    if (!id) return "";
    const station = (layout?.points || []).find((p) => p.id === id || p.destination === id);
    if (station?.name) return station.name;
    const item = [...(model?.stations || []), ...(model?.points || [])].find((p) => p.id === id);
    return item?.label || item?.name || id;
  }

  function orderDestinations(order) {
    const fromDrive = (order?.driveOrders || []).map((d) => d.destination?.destination).filter(Boolean);
    if (fromDrive.length) return fromDrive;
    return (order?.destinations || []).map((d) => d.locationName).filter(Boolean);
  }

  function orderState(order) {
    const [label, tone] = ORDER_STATES[order?.state] || ["状态未知", "muted"];
    return { label, tone, active: ACTIVE_ORDER_STATES.has(order?.state) };
  }

  /**
   * One line per task: which vehicle, where to, and what is happening now.
   * `waiting` maps vehicle id -> readable waiting reason (from the live map).
   */
  function orderSummary(order, context = {}) {
    const vehicle = order?.processingVehicle || order?.intendedVehicle || "";
    const stops = orderDestinations(order).map((id) => placeName(id, context));
    const state = orderState(order);
    let detail = state.label;
    if (order?.state === "BEING_PROCESSED" && vehicle && context.waiting?.[vehicle]) {
      detail = context.waiting[vehicle];
      state.tone = "waiting";
    } else if (order?.state === "BEING_PROCESSED" && stops.length) detail = "前往 " + stops[stops.length - 1];
    else if (order?.state === "DISPATCHABLE" && !vehicle) detail = "等待空闲车辆";
    return {
      id: order?.name || "",
      vehicle: vehicle || "待分配",
      to: stops.join(" → ") || "—",
      state: state.label,
      tone: state.tone,
      active: state.active,
      detail,
      created: order?.creationTime || null,
      finished: order?.finishedTime || null,
    };
  }

  /** Active tasks first (oldest first, like a queue), then the latest finished ones. */
  function taskQueue(orders, context = {}, { recent = 5 } = {}) {
    const rows = (orders || []).map((o) => orderSummary(o, context));
    const time = (row) => Date.parse(row.created || "") || 0;
    const active = rows.filter((r) => r.active).sort((a, b) => time(a) - time(b));
    const done = rows.filter((r) => !r.active).sort((a, b) => (Date.parse(b.finished || b.created || "") || 0) - (Date.parse(a.finished || a.created || "") || 0));
    return { active, recent: done.slice(0, recent) };
  }

  /** Current status of one vehicle in operator words. */
  function vehicleStatus(robot, { connected = true, orders = [], waiting = {}, ...context } = {}) {
    if (!robot) return { label: "未知", tone: "muted" };
    if (!connected || robot.stale) return { label: "信号中断", tone: "alert" };
    if (!robot.online) return { label: "离线", tone: "alert" };
    if (robot.status === "ERROR") return { label: "故障", tone: "alert" };
    if (robot.paused) return { label: "已暂停", tone: "waiting" };
    if (waiting[robot.id]) return { label: waiting[robot.id], tone: "waiting" };
    const order = (orders || []).find((o) => o.name === robot.task) ||
      (orders || []).find((o) => o.processingVehicle === robot.id && o.state === "BEING_PROCESSED");
    if (order?.state === "BEING_PROCESSED" || robot.status === "EXECUTING") {
      const stops = orderDestinations(order);
      return { label: stops.length ? "前往 " + placeName(stops[stops.length - 1], context) : "执行任务", tone: "moving" };
    }
    if (robot.status === "CHARGING") return { label: "充电中", tone: "online" };
    if (robot.status === "UNAVAILABLE") return { label: "不可用", tone: "alert" };
    if (robot.status === "IDLE") return { label: "空闲", tone: "online" };
    return { label: "状态未知", tone: "muted" };
  }

  function batteryText(robot) {
    const value = robot?.battery;
    return Number.isFinite(value) ? Math.round(value) + "%" : "—";
  }

  /** Local date-time in a fixed, unambiguous format: 2026-11-20 14:05. */
  function formatTime(value, { seconds = false, date = true } = {}) {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return "—";
    const p = (n) => String(n).padStart(2, "0");
    const t = p(d.getHours()) + ":" + p(d.getMinutes()) + (seconds ? ":" + p(d.getSeconds()) : "");
    if (!date) return t;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return t;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + t;
  }

  /**
   * Things a shift operator must act on, most serious first. Each item:
   * {level: "alert"|"warn", vehicle?, text, route}. `alerts` takes server-side
   * alerts ({level|severity, vehicleId|robotId, message|text}) when the gateway
   * provides them; until then the list is derived from the live fleet state.
   */
  function exceptions({ received, connected, robots = [], orders = [], waiting = {}, alerts = [],
    unresolved = 0, storageError = "", loadError = "", notReady = "", context = {} } = {}) {
    const items = [];
    if (loadError) items.push({ level: "alert", text: "服务加载失败：" + loadError, route: "events" });
    if (!received) return items;
    if (!connected) items.push({ level: "alert", text: "与车队的连接中断，显示的是最后已知状态", route: "fleet" });
    for (const alert of alerts || []) {
      const level = /crit|error|alert|high/i.test(alert.level || alert.severity || "") ? "alert" : "warn";
      items.push({ level, vehicle: alert.vehicleId || alert.robotId || "", text: alert.message || alert.text || "", route: "events", id: alert.id });
    }
    for (const robot of robots) {
      if (!connected) break;
      if (robot.stale || !robot.online) items.push({ level: "alert", vehicle: robot.id, text: robot.stale ? "信号中断" : "离线", route: "fleet" });
      else if (robot.status === "ERROR") items.push({ level: "alert", vehicle: robot.id, text: "车辆报告故障", route: "fleet" });
      else if (robot.paused) items.push({ level: "warn", vehicle: robot.id, text: "已暂停，不会接新任务", route: "fleet" });
      else if (waiting[robot.id]) items.push({ level: "warn", vehicle: robot.id, text: waiting[robot.id], route: "operations" });
    }
    const hour = Date.now() - 3600e3;
    for (const order of orders) {
      if (!["FAILED", "UNROUTABLE"].includes(order.state)) continue;
      if ((Date.parse(order.finishedTime || order.creationTime || "") || 0) < hour) continue;
      const summary = orderSummary(order, context);
      items.push({ level: "alert", vehicle: summary.vehicle === "待分配" ? "" : summary.vehicle,
        text: `${summary.state} · ${summary.to}`, route: "missions" });
    }
    if (unresolved) items.push({ level: "warn", text: "派车请求结果未确认，请在历史记录中查看", route: "events" });
    if (storageError) items.push({ level: "alert", text: "本机无法保存操作记录，暂不能派车", route: "events" });
    if (notReady) items.push({ level: "warn", text: notReady, route: "operations" });
    // Dedupe server alerts against derived ones for the same vehicle and text.
    const seen = new Set();
    return items.filter((i) => { const k = i.level + i.vehicle + i.text; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.level === "alert" ? 0 : 1) - (b.level === "alert" ? 0 : 1));
  }

  /** vehicle id -> waiting reason from openTCS allocations (no guessing). */
  function waitingReasons(robots, blockingResource) {
    const out = {};
    if (typeof blockingResource !== "function") return out;
    for (const robot of robots || []) {
      if (!robot?.task || robot.paused || robot.stale || !robot.online) continue;
      const block = blockingResource(robot, robots);
      if (block) out[robot.id] = `等待 ${block.holder} 让路`;
    }
    return out;
  }

  const ENGINEERING_ROUTES = new Set(["maps", "simulation"]);
  function engineeringEnabled(storage = root.localStorage) {
    try { return storage?.getItem(ENGINEERING_KEY) === "1"; } catch (_) { return false; }
  }
  function setEngineering(enabled, { storage = root.localStorage, document = root.document } = {}) {
    try { storage?.setItem(ENGINEERING_KEY, enabled ? "1" : "0"); } catch (_) { /* per-viewer convenience only */ }
    document?.documentElement?.classList.toggle("engineering-mode", Boolean(enabled));
    const toggle = document?.getElementById?.("engineeringToggle");
    if (toggle) toggle.setAttribute("aria-pressed", String(Boolean(enabled)));
    return Boolean(enabled);
  }

  const api = {
    ENGINEERING_KEY, ENGINEERING_ROUTES, placeName, orderDestinations, orderState, orderSummary,
    taskQueue, vehicleStatus, batteryText, exceptions, waitingReasons, formatTime, engineeringEnabled, setEngineering,
  };
  root.OperatorView = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  // Apply before first paint so engineering-only parts never flash for operators.
  if (root.document?.documentElement && engineeringEnabled())
    root.document.documentElement.classList.add("engineering-mode");
})(globalThis);
