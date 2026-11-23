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
    return taskSteps(order).map((s) => s.station).filter(Boolean);
  }

  // openTCS location operation -> operator task step (see Fleetserver tasks.py).
  const KINDS = { NOP: "move", pick: "pick", drop: "drop", waitForTrigger: "wait", startCharging: "charge" };
  const STEP_LABELS = { move: "", pick: "取货", drop: "送货", wait: "等待确认", charge: "充电" };
  const CONFIRM_LABELS = { pick: "取货完成", drop: "送货完成", wait: "可以继续" };
  const ALERT_TITLES = { OFFLINE: "离线", ERROR: "车辆报告故障", ORDER_FAILED: "任务失败", WAITING_TOO_LONG: "等待时间过长", LOW_BATTERY: "电量低" };

  /** Steps of a transport order: station, kind, openTCS drive state, current. */
  function taskSteps(order) {
    const drives = order?.driveOrders || [];
    const list = order?.destinations?.length ? order.destinations : drives;
    const index = Number.isInteger(order?.currentDriveOrderIndex) ? order.currentDriveOrderIndex : -1;
    return list.map((item, i) => {
      const drive = drives[i] || {};
      const destination = drive.destination || item;
      const station = destination.locationName || destination.destination || item.locationName || null;
      const operation = destination.operation || item.operation || "NOP";
      return {
        station, kind: KINDS[operation] || "other", operation,
        state: item.state || drive.state || null,
        current: i === index && order?.state === "BEING_PROCESSED",
      };
    });
  }

  function stepText(step, context) {
    const name = placeName(step.station, context) || "—";
    const label = STEP_LABELS[step.kind];
    return label ? `${name} ${label}` : name;
  }

  /** What a vehicle does at a station now, in words, from robot.stationWork. */
  function stationWorkText(work, context = {}) {
    if (!work) return "";
    const name = placeName(work.station, context);
    const label = STEP_LABELS[work.kind] || "";
    if (work.needsOperator) return `在 ${name} 等待确认${label ? "：" + label : ""}`;
    if (work.atStation) return work.kind === "charge" ? `在 ${name} 充电` : `在 ${name} 作业`;
    return `前往 ${name}${label ? " " + label : ""}`;
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
    const steps = taskSteps(order);
    const state = orderState(order);
    const robot = (context.robots || []).find((r) => r.id === vehicle);
    const work = robot?.stationWork?.orderId === order?.name ? robot.stationWork : null;
    let detail = state.label, confirm = null;
    if (order?.state === "BEING_PROCESSED" && work?.needsOperator) {
      detail = stationWorkText(work, context);
      state.tone = "waiting";
      confirm = { robotId: vehicle, label: CONFIRM_LABELS[work.kind] || "确认" };
    } else if (order?.state === "BEING_PROCESSED" && vehicle && context.waiting?.[vehicle]) {
      detail = context.waiting[vehicle];
      state.tone = "waiting";
    } else if (order?.state === "BEING_PROCESSED" && work) detail = stationWorkText(work, context);
    else if (order?.state === "BEING_PROCESSED" && steps.length) {
      const current = steps.find((s) => s.current) || steps[steps.length - 1];
      detail = "前往 " + stepText(current, context);
    } else if (order?.state === "DISPATCHABLE" && !vehicle) detail = "等待空闲车辆";
    return {
      id: order?.name || "",
      vehicle: vehicle || "待分配",
      to: steps.map((st) => stepText(st, context)).join(" → ") || "—",
      confirm,
      state: state.label,
      tone: state.tone,
      active: state.active,
      detail,
      created: order?.creationTime || null,
      finished: order?.finishedTime || null,
    };
  }

  const QUEUE_STEP = { move: "", pick: "取货", drop: "送货", wait: "等待确认", charge: "充电" };
  /** One gateway queue entry (a task waiting for a busy station) as a task row. */
  function queueSummary(entry, context = {}) {
    const to = (entry.steps || []).map((s) => {
      const label = QUEUE_STEP[s.action] || "";
      return placeName(s.station, context) + (label ? " " + label : "");
    }).join(" → ") || "—";
    const why = String(entry.reason?.message || "").split("；")[0];
    const queued = entry.state === "QUEUED";
    const states = { QUEUED: ["排队中", "waiting"], FAILED: ["排队后派车失败", "alert"], CANCELLED: ["已撤销排队", "muted"], DISPATCHED: ["已派出", "online"] };
    const [label, tone] = states[entry.state] || [entry.state, "muted"];
    return {
      id: entry.id,
      vehicle: entry.robotId || "待分配",
      to,
      confirm: null,
      cancel: queued ? { orderId: entry.id } : null,
      state: label,
      tone,
      active: queued,
      queued: true,
      detail: queued ? `排队第 ${entry.position || "?"} 位${why ? "：" + why : ""}，空出后自动派出`
        : entry.state === "FAILED" ? `${label}：${why}` : label,
      created: entry.createdAt || null,
      finished: queued ? null : entry.updatedAt || null,
    };
  }

  /** Active tasks first (oldest first, like a queue), then the latest finished ones.
   *  `queue` is the gateway order queue ({queued, recent}); a dispatched entry
   *  is already an openTCS order, so only queued/failed/cancelled ones show. */
  function taskQueue(orders, context = {}, { recent = 5, queue = null } = {}) {
    const rows = (orders || []).map((o) => orderSummary(o, context));
    const waiting = [...(queue?.queued || []), ...(queue?.recent || []).filter((e) => e.state !== "DISPATCHED")]
      .map((e) => queueSummary(e, context));
    const time = (row) => Date.parse(row.created || "") || 0;
    const active = rows.filter((r) => r.active).sort((a, b) => time(a) - time(b))
      .concat(waiting.filter((r) => r.active).sort((a, b) => time(a) - time(b)));
    const done = rows.filter((r) => !r.active).concat(waiting.filter((r) => !r.active))
      .sort((a, b) => (Date.parse(b.finished || b.created || "") || 0) - (Date.parse(a.finished || a.created || "") || 0));
    return { active, recent: done.slice(0, recent) };
  }

  /** Current status of one vehicle in operator words. */
  function vehicleStatus(robot, { connected = true, orders = [], waiting = {}, ...context } = {}) {
    if (!robot) return { label: "未知", tone: "muted" };
    if (!connected || robot.stale) return { label: "信号中断", tone: "alert" };
    if (!robot.online) return { label: "离线", tone: "alert" };
    if (robot.status === "ERROR") return { label: "故障", tone: "alert" };
    if (robot.paused) return { label: "已暂停", tone: "waiting" };
    if (robot.stationWork?.needsOperator) return { label: stationWorkText(robot.stationWork, context), tone: "waiting" };
    if (waiting[robot.id]) return { label: waiting[robot.id], tone: "waiting" };
    if (robot.stationWork) return { label: stationWorkText(robot.stationWork, context), tone: robot.stationWork.atStation ? "online" : "moving" };
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
  /** Where the battery number comes from, for a tooltip. */
  function batterySourceText(robot) {
    return robot?.batterySource === "ROBOT" ? "车辆上报" : robot?.batterySource === "SIMULATION_MODEL" ? "仿真模型估算" : "未上报";
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
  function exceptions({ received, connected, robots = [], orders = [], waiting = {}, alerts = [], alertsSupported = false,
    unresolved = 0, storageError = "", loadError = "", notReady = "", context = {} } = {}) {
    const items = [];
    if (loadError) items.push({ level: "alert", text: "服务加载失败：" + loadError, route: "events" });
    if (!received) return items;
    if (!connected) items.push({ level: "alert", text: "与车队的连接中断，显示的是最后已知状态", route: "fleet" });
    for (const alert of alerts || []) {
      const level = /crit|error|alert|high/i.test(alert.level || alert.severity || "") ? "alert" : "warn";
      // Known kinds use portal wording (translated); the gateway's own detail explains why and what to do.
      items.push({ level, vehicle: alert.vehicleId || alert.robotId || "", text: ALERT_TITLES[alert.kind] || alert.title || alert.message || alert.text || "",
        detail: alert.detail || "", route: alert.orderId ? "missions" : "fleet", id: alert.id, acknowledged: Boolean(alert.acknowledged) });
    }
    // When the gateway reports alerts it owns offline/fault/failed; derive only what it does not report.
    for (const robot of robots) {
      if (!connected) break;
      if (robot.stationWork?.needsOperator)
        items.push({ level: "warn", vehicle: robot.id, text: stationWorkText(robot.stationWork, context), route: "operations",
          confirm: { robotId: robot.id, label: CONFIRM_LABELS[robot.stationWork.kind] || "确认" } });
      if (robot.stale || !robot.online) { if (!alertsSupported) items.push({ level: "alert", vehicle: robot.id, text: robot.stale ? "信号中断" : "离线", route: "fleet" }); }
      else if (robot.status === "ERROR") { if (!alertsSupported) items.push({ level: "alert", vehicle: robot.id, text: "车辆报告故障", route: "fleet" }); }
      else if (robot.paused) items.push({ level: "warn", vehicle: robot.id, text: "已暂停，不会接新任务", route: "fleet" });
      else if (waiting[robot.id]) items.push({ level: "warn", vehicle: robot.id, text: waiting[robot.id], route: "operations" });
    }
    const hour = Date.now() - 3600e3;
    for (const order of alertsSupported ? [] : orders) {
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
    // Open critical first, then work waiting for a person, then the rest; acknowledged last.
    const rank = (i) => (i.acknowledged ? 4 : 0) + (i.level === "alert" ? 0 : i.confirm ? 1 : 2);
    return items.filter((i) => { const k = i.level + i.vehicle + i.text; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b));
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
    taskQueue, queueSummary, vehicleStatus, batteryText, batterySourceText, exceptions, waitingReasons,
    taskSteps, stepText, stationWorkText, STEP_LABELS, formatTime, engineeringEnabled, setEngineering,
  };
  root.OperatorView = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  // Apply before first paint so engineering-only parts never flash for operators.
  if (root.document?.documentElement && engineeringEnabled())
    root.document.documentElement.classList.add("engineering-mode");
})(globalThis);
