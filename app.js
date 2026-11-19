/* Live topology comes from openTCS; the pinned ROS raster is a separate background. */
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Translation-safe "write only when changed" (see portal-i18n.js).
const setIfChanged = window.PortalI18n?.setIfChanged || ((el, prop, value) => (el[prop] !== value ? ((el[prop] = value), true) : false));
const html = (id, value) => {
  setIfChanged($(id), "innerHTML", value);
};
let robots = [],
  orders = [],
  layout = null,
  model = null,
  selectedRobotId = null,
  selectedObject = null;
let upstreamOnline = false,
  streamOnline = false,
  stateReceived = false,
  modelFresh = false;
let loadingModel = false,
  modelError = "",
  busy = false,
  lastStateAt = null,
  upstreamAgeSeconds = null,
  modelReadAt = null,
  bootError = "",
  receiptSnapshot = { records: [] },
  receiptView = null,
  mapReleaseView = null,
  mapReleaseScope = null,
  sceneHistoryView = null,
  sceneLibraryView = null,
  sceneLibraryScope = null,
  simulationRunView = null,
  simulationRunScope = null,
  scenarioView = null,
  replayView = null,
  scenarioScope = null,
  environmentView = null,
  environmentScope = null,
  faultView = null,
  faultScope = null,
  taskHistoryView = null,
  eventHistoryView = null,
  replayActive = false,
  publicationBlockReason = "",
  publicationSourceBlock = "",
  publicationStatus = null,
  connectionCapabilities = null,
  publishedSourceGeneration = 0,
  synchronizedReleaseId = null,
  synchronizingReleaseId = null,
  portalReady = false,
  lastActionError = "",
  lastActionRequestId = null;
let toastTimer,
  focusTimer,
  mapUnit = 1,
  camera = { x: -300, y: -200, w: 600, h: 400 },
  fitCamera = { ...camera };
const events = [],
  connected = () => upstreamOnline && streamOnline;
const currentRobot = () => robots.find((r) => r.id === selectedRobotId);
const validXY = (object) =>
  Number.isFinite(object?.x) && Number.isFinite(object?.y);
const pointXY = (object) => [object.x * 60, -object.y * 60];
let background = null;
let backgroundGeneration = 0;
let guestBackgroundRetryAt = 0;
let lastGuestOverview = false;
// Feature gates follow the capabilities the gateway declares for the active environment.
const environmentSupports = (capabilities, name) =>
  Array.isArray(capabilities?.activeEnvironment?.capabilities) &&
  capabilities.activeEnvironment.capabilities.includes(name);
const guestOverview = () => !api.authorized && api.portalSessionURL?.() &&
  api.capabilities?.environment === 'SIM' && environmentSupports(api.capabilities, 'managed_services') &&
  PortalState.route(location.hash) === 'operations' && !replayActive;
const guestObservation = () => guestOverview() ? guestMonitor?.snapshot() || {guest: true} : null;
const guestMapBackground = (state = guestObservation()) =>
  window.OverviewVideo?.observationBackground(background, state?.map) ? background : null;
const overviewMapModel = () => guestOverview() ? guestObservation()?.model || null : model;
const overviewMapBackground = () => guestOverview() ? guestMapBackground() : background;
const guestMonitor = window.OverviewVideo?.monitorGuest({
  active: () => guestOverview() && document.visibilityState !== 'hidden' ? api.scope : null,
  onChange(value) {
    if (value?.model !== lastGuestModel) {
      lastGuestModel = value?.model;
      if (value?.model) fitMap();
    }
    renderMap();
  },
});
let lastGuestModel;
const overviewVideo = window.OverviewVideo?.mount({
  elements: {
    modes: $("overviewModes"), layout: $("overviewMapLayout"), svg: $("mapSvg"),
    sidePanel: $("overviewSidePanel"), sideHost: $("overviewSideHost"), overlayHost: $("overviewOverlayHost"),
    controls: $("overviewObservation"), status: $("overviewVideoStatus"),
    access: $("overviewViewerAccess"), open: $("overviewViewerOpen"), review: $("overviewViewerReview"),
    stopReview: $("overviewViewerStopReview"), stopContext: $("overviewViewerStopContext"),
    confirm: $("overviewViewerStop"), back: $("overviewViewerBack"),
    refresh: $("overviewViewerRefresh"), prepare: $("overviewViewerPrepare"),
  },
  authorized: () => api.authorized && api.deploymentConfirmed,
  guestObservation,
  access: openAccess,
  open: () => environmentView?.openObservation(),
  review: () => environmentView?.reviewObservationClose(),
  close: () => environmentView?.closeObservation(),
  cancel: () => environmentView?.cancelObservationReview(),
  refresh: () => environmentView?.refresh(),
  observe: (value) => environmentView?.setObservationVisible(value),
  onLayoutChange: renderMap,
  toSVG: (x, y) => pointXY({x, y}),
  mapContext(state) {
    if (guestOverview()) {
      const observation = guestObservation();
      return state === observation.state && observation.model && guestMapBackground(observation) ? observation.map : null;
    }
    const publication = publicationStatus?.activePublication;
    const releaseId = state?.releaseId;
    if (!modelFresh || !releaseId || synchronizedReleaseId !== releaseId ||
        background?.source !== "published-scene" || background.releaseId !== releaseId ||
        state.activePublicationStatus !== "READY" || publication?.status !== "READY" ||
        publication.releaseId !== releaseId || publication.requestId !== state.activePublicationId ||
        !mapReleaseView?.controller.state.statusFresh) return null;
    const release = publicationStatus.releases?.find(item => item.releaseId === releaseId);
    if (!release) return null;
    return { ...release, publicationId: publication.requestId };
  },
});
let livePoseMonitor = null, guestPoseMonitor = null;
const number = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : "未知";
function notify(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 5500);
}
function log(message, error = false) {
  events.unshift({ message, error, time: new Date() });
  if (events.length > 40) events.pop();
  html(
    "commsLog",
    events
      .map(
        (e) =>
          `<li><i class="event-dot ${e.error ? "error" : ""}"></i><time>${esc(e.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}</time><span>${esc(e.message)}</span></li>`,
      )
      .join(""),
  );
  $("activityTabCount").textContent = events.length;
  $("activityEmpty").hidden = events.length > 0;
}
function badge(robot) {
  const stale = !connected() || robot.stale;
  const label = stale
    ? "Stale"
    : robot.paused
      ? "Pause requested"
      : robot.status || "未知";
  const style =
    stale || !robot.online
      ? "alert"
      : robot.status === "EXECUTING"
        ? "moving"
        : "online";
  return `<span class="status-badge ${style}">${esc(label)}</span>`;
}
function renderFleet() {
  const online = connected();
  $("totalCount").textContent = stateReceived ? robots.length : "—";
  $("onlineCount").textContent = stateReceived
    ? online
      ? robots.filter((r) => r.online && !r.stale).length
      : 0
    : "—";
  $("movingCount").textContent = stateReceived
    ? online
      ? robots.filter((r) => r.status === "EXECUTING" && !r.stale).length
      : 0
    : "—";
  const alerts = robots.filter((r) => !online || !r.online || r.stale).length;
  $("alertsCount").textContent = stateReceived ? alerts : "—";
  $("attentionCaption").textContent = alerts
    ? "请检查车辆反馈"
    : stateReceived ? "按当前报告计算，非完整准入" : "尚未取得报告";
  $("vehicleNavCount").textContent = robots.length;
  $("orderNavCount").textContent = orders.length;
  $("orderNavCount").hidden = orders.length===0;
  $("orderNavCount").title = "当前内核订单数量，不含历史记录";
  $("fleetMode").textContent = `${robots.length} reported`;
  $("connectionPill").className =
    `connection-pill ${online ? "connected" : stateReceived ? "disconnected" : ""}`;
  html(
    "connectionPill",
    `<i></i><span>${online ? "内核反馈连通" : stateReceived ? "反馈不可用 / 已过期" : "等待连接"}</span>`,
  );
  $("sidebarStatus").className = `server-status ${online ? "connected" : ""}`;
  html(
    "sidebarStatus",
    `<i></i>${online ? "Kernel connected" : "Awaiting live feedback"}`,
  );
  $("staleBanner").hidden = replayActive || !stateReceived || online;
  $("footerState").textContent = online
    ? "Live state · openTCS"
    : "Waiting for current feedback";
  const term = $("robotSearch").value.trim().toLowerCase(),
    visible = robots.filter((r) =>
      (r.id + " " + (r.name || "")).toLowerCase().includes(term),
    );
  html(
    "robotList",
    visible
      .map(
        (r) =>
          `<button class="robot-row ${selectedObject?.kind === "robots" && r.id === selectedObject.id ? "active" : ""}" data-robot-id="${esc(r.id)}"><span class="robot-avatar">${icon("robot")}</span><span><strong>${esc(r.id)}</strong><small>${esc(r.location || "位置未报告")}</small></span><i class="robot-dot ${!online || !r.online || r.stale ? "alert" : ""}"></i></button>`,
      )
      .join("") ||
      `<div class="sidebar-empty">${icon(term ? "search" : "robot")}<strong>${term ? "没有匹配车辆" : "尚无车辆报告"}</strong><p>${term ? "请尝试其他车辆名称。" : "车辆由管理接口报告后在此显示。"}</p></div>`,
  );
  html(
    "vehicleTable",
    robots
      .map(
        (r) =>
          `<tr><td><button class="table-link" data-robot-id="${esc(r.id)}">${esc(r.id)}</button></td><td>${badge(r)}</td><td>${esc(r.location || "未知")}</td><td>${r.battery == null ? "未知" : esc(r.battery) + "%"}</td><td>${esc(r.task || "—")}</td></tr>`,
      )
      .join(""),
  );
  $("vehiclesEmpty").hidden = robots.length > 0;
  html(
    "ordersTable",
    orders
      .map((o) => {
        const destinations = (o.destinations || [])
          .map((d) => d.locationName)
          .filter(Boolean)
          .join(" → ");
        const created = o.creationTime
          ? new Date(o.creationTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        return `<tr><td title="${esc(o.name)}">${esc(o.name)}</td><td>${esc(o.processingVehicle || o.intendedVehicle || "Unassigned")}</td><td>${esc(destinations || "—")}</td><td><span class="status-badge ${o.state === "BEING_PROCESSED" ? "moving" : ""}">${esc(o.state || "未知")}</span></td><td>${esc(created)}</td></tr>`;
      })
      .join(""),
  );
  $("ordersEmpty").hidden = orders.length > 0;
  $("ordersTabCount").textContent = orders.length;
}
function destinations() {
  const available = new Set(
    (model?.stations || []).filter((s) => s.locked !== true).map((s) => s.id),
  );
  return (layout?.points || []).filter((p) => available.has(p.destination));
}
function renderControls() {
  const unresolved = PortalState.unresolved(receiptSnapshot);
  const pendingCommand = unresolved[0]?.envelope?.command;
  const dispatchRobotId = pendingCommand?.robotId || selectedRobotId;
  const robot = robots.find(item => item.id === dispatchRobotId),
    inspectedRobot = selectedObject?.kind === "robots" ? robots.find(item => item.id === selectedObject.id) : null,
    signedIn = api.authorized,
    writable = Boolean(receiptSnapshot.canWrite),
    ready = connected();
  $("accessLabel").textContent = signedIn ? "操作员已登录" : "操作员登录";
  $("inspectorAccess").textContent = signedIn
    ? writable ? "操作员已登录" : "已登录 · 当前仅可查询"
    : "仅查看 · 操作员登录后可操作";
  renderAccess();
  $("estopButton").disabled =
    busy || !ready || !signedIn || !writable || !robots.length;
  $("resumeButton").disabled = $("estopButton").disabled || Boolean(publicationBlockReason || publicationSourceBlock);
  $("newOrderButton").disabled = busy || !ready || !robots.length;
  const choices = destinations(),
    oldDestination = pendingCommand?.destination || $("toPoint").value;
  html(
    "dispatchRobot",
    robots
      .map((r) => `<option value="${esc(r.id)}">${esc(r.id)}</option>`)
      .join("") || '<option value="">没有可用车辆</option>',
  );
  if (pendingCommand?.robotId && !robots.some(r => r.id === pendingCommand.robotId))
    $("dispatchRobot").innerHTML += `<option value="${esc(pendingCommand.robotId)}">${esc(pendingCommand.robotId)}（原请求，当前未报告）</option>`;
  $("dispatchRobot").value = dispatchRobotId || "";
  html(
    "toPoint",
    choices
      .map(
        (p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`,
      )
      .join("") || '<option value="">没有已配置可用目的站</option>',
  );
  if (choices.some((p) => p.id === oldDestination))
    $("toPoint").value = oldDestination;
  else if (pendingCommand?.destination) {
    $("toPoint").innerHTML += `<option value="${esc(pendingCommand.destination)}">${esc(pendingCommand.destination)}（原请求，当前不可用）</option>`;
    $("toPoint").value = pendingCommand.destination;
  }
  $("fromPoint").textContent = robot?.location || "车辆报告位置（未知）";
  let reason = !ready
    ? "等待当前车队反馈。"
    : !signedIn
      ? "请先登录操作员会话，再提交导航请求。"
      : !writable
        ? receiptSnapshot.writeBlockedReason || "当前连接仅可查询，尚不具备提交控制请求的条件。"
      : !robot
        ? "请选择车辆。"
        : !robot.online || robot.stale
          ? "所选车辆离线或状态过期。"
          : robot.paused
            ? "所选车辆已有暂停请求。"
            : !modelFresh
              ? "请先刷新运行模型。"
              : !choices.length
                ? "配置目的站与运行模型没有可用匹配，请查看地图与发布。"
                : busy
                  ? "正在等待请求回执。"
                    : publicationBlockReason || publicationSourceBlock
                    ? publicationBlockReason || publicationSourceBlock
                    : unresolved.length
                    ? "有未决导航请求。请到事件与对账查询原 requestId；不创建第二个意图。"
                    : "起点取车辆报告位置；当前仅导航 NOP。";
  $("dispatchHint").textContent = reason;
  $("sendOrderButton").disabled =
    busy ||
    !ready ||
    !signedIn ||
    !writable ||
    !robot?.online ||
    robot.stale ||
    robot.paused ||
    !modelFresh ||
    !choices.length ||
    unresolved.length > 0 ||
    Boolean(publicationBlockReason) ||
    Boolean(publicationSourceBlock) ||
    Boolean(receiptSnapshot.storageError);
  $("dispatchRobot").disabled = unresolved.length > 0 || busy;
  $("toPoint").disabled = unresolved.length > 0 || busy;
  $("cancelOrder").disabled =
    busy || !ready || !signedIn || !writable || !inspectedRobot?.task;
}
function renderInspector() {
  let object;
  if (selectedObject)
    object =
      selectedObject.kind === "robots"
        ? robots.find((r) => r.id === selectedObject.id)
        : model?.[selectedObject.kind]?.find((p) => p.id === selectedObject.id);
  $("inspectorEmpty").hidden = Boolean(object);
  $("objectDetails").hidden = !object;
  $("inspectorType").textContent = !object
    ? "No selection"
    : {
        robots: "车辆",
        points: "点位",
        paths: "路线",
        stations: "停车工位",
      }[selectedObject.kind];
  if (!object) return;
  $("selectedRobotName").textContent = object.label || object.id;
  html(
    "objectIcon",
    icon(
      selectedObject.kind === "robots"
        ? "robot"
        : selectedObject.kind === "paths"
          ? "node"
          : "map",
    ),
  );
  let properties;
  if (selectedObject.kind === "robots") {
    const state = badge(object);
    html("robotState", state.replace(/^<span[^>]*>|<\/span>$/g, ""));
    $("robotState").className =
      "status-badge " +
      (!connected() || object.stale || !object.online
        ? "alert"
        : object.status === "EXECUTING"
          ? "moving"
          : "online");
    properties = [
      ["当前位置", object.location || "未知"],
      [
        "坐标",
        validXY(object)
          ? `${number(object.x)}, ${number(object.y)} m`
          : "未知",
      ],
      ["电量", object.battery == null ? "未知" : `${object.battery}%`],
      [
        "速度",
        object.velocity == null ? "未知" : `${object.velocity} m/s`,
      ],
      ["Order", object.task || "未报告任务"],
      ["处理状态", object.processingState || "未知"],
    ];
  } else if (selectedObject.kind === "paths") {
    $("robotState").textContent = object.locked === true ? "Locked" : "Path";
    $("robotState").className = "status-badge";
    properties = [
      ["From", object.source],
      ["To", object.target],
      [
        "Length",
        Number.isFinite(object.length)
          ? `${number(object.length)} m`
          : "未知",
      ],
      [
        "Speed limit",
        Number.isFinite(object.maxVelocity)
          ? `${number(object.maxVelocity)} m/s`
          : "未知",
      ],
      ["Geometry", object.connectionType],
      ["Source", "openTCS plant model"],
    ];
  } else {
    $("robotState").textContent =
      object.type || selectedObject.kind.slice(0, -1);
    $("robotState").className = "status-badge";
    properties = [
      ["X", `${number(object.x)}${Number.isFinite(object.x) ? " m" : ""}`],
      ["Y", `${number(object.y)}${Number.isFinite(object.y) ? " m" : ""}`],
      ["Source", "openTCS plant model"],
    ];
    if (object.links)
      properties.splice(2, 0, [
        "Linked points",
        object.links.join(", ") || "None",
      ]);
  }
  html(
    "objectProperties",
    properties
      .map(
        ([key, value]) =>
          `<div><dt>${esc(key)}</dt><dd>${esc(value ?? "未知")}</dd></div>`,
      )
      .join(""),
  );
  $("cancelOrder").hidden = selectedObject.kind !== "robots";
}
function applyCamera() {
  const viewBox = `${camera.x} ${camera.y} ${camera.w} ${camera.h}`;
  $("mapSvg").setAttribute("viewBox", viewBox);
  $("mapBackgroundSvg").setAttribute("viewBox", viewBox);
  overviewVideo?.project();
}
function fitMap() {
  const displayedModel = overviewMapModel();
  const displayedBackground = overviewMapBackground();
  const objects = [
    ...(displayedModel?.points || []),
    ...(displayedModel?.stations || []),
    ...(displayedModel?.paths || []).flatMap((p) => p.controlPoints || []),
    ...(connectionCapabilities?.environment === "SIM" ? [] : robots.filter((robot) => !robot.stale)),
  ].filter(validXY);
  if (displayedBackground) {
    const { origin: [ox, oy, yaw], resolution: r, width, height } = displayedBackground;
    for (const [u, v] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ])
      objects.push({
        x:
          ox +
          r * (u * Math.cos(yaw) - (height - v) * Math.sin(yaw)),
        y:
          oy +
          r * (u * Math.sin(yaw) + (height - v) * Math.cos(yaw)),
      });
  }
  if (!objects.length) fitCamera = { x: -300, y: -200, w: 600, h: 400 };
  else {
    const xy = objects.map(pointXY),
      xs = xy.map((p) => p[0]),
      ys = xy.map((p) => p[1]);
    const w = Math.max(160, Math.max(...xs) - Math.min(...xs)),
      h = Math.max(120, Math.max(...ys) - Math.min(...ys));
    const padX = Math.max(80, w * 0.16),
      padY = Math.max(65, h * 0.16);
    fitCamera = {
      x: (Math.min(...xs) + Math.max(...xs) - w) / 2 - padX,
      y: (Math.min(...ys) + Math.max(...ys) - h) / 2 - padY,
      w: w + 2 * padX,
      h: h + 2 * padY,
    };
  }
  camera = { ...fitCamera };
  applyCamera();
}
let lastRunOverlay = null;
function renderMap() {
  const guest = guestOverview();
  const displayedModel = overviewMapModel();
  const displayedBackground = overviewMapBackground();
  $("mapBackground").setAttribute('visibility', guest && !displayedBackground ? 'hidden' : 'visible');
  $("mapSetupButton").hidden = !!guest;
  if (guest) $("backgroundCaption").hidden = !displayedBackground;
  else if (lastGuestOverview) $("backgroundCaption").hidden = !$("backgroundCaption").textContent;
  lastGuestOverview = !!guest;
  const runState=simulationRunView?.controller.state;
  const currentRelease=runState?.status?.currentAdmission?.releaseId;
  const overlayAllowed = !guest && window.SimulationRunUI && currentRelease && modelFresh && synchronizedReleaseId===currentRelease;
  let runOverlay = "";
  if (overlayAllowed && runState?.fresh) {
    runOverlay = window.SimulationRunUI.pairMapOverlay(window.SimulationRunUI.liveRunsForRelease((runState.observedRuns.length?runState.observedRuns:[runState.run]),currentRelease),model || {},false);
    lastRunOverlay = { releaseId: currentRelease, html: runOverlay };
  } else if (overlayAllowed && runState?.refreshing && !runState.error && lastRunOverlay?.releaseId === currentRelease) {
    // The 5 s run poll clears `fresh` while its requests are in flight. Keep
    // the last drawing until the poll finishes, so the purple resource
    // markers don't blink off and on with every poll.
    runOverlay = lastRunOverlay.html;
  } else lastRunOverlay = null;
  html("rtsOverlay", runOverlay);
  const map = displayedModel || { points: [], paths: [], stations: [] },
    byId = new Map(map.points.map((p) => [p.id, p]));
  if ($("mapSvg").clientWidth > 0 && $("mapSvg").clientHeight > 0)
    mapUnit = Math.max(
      fitCamera.w / $("mapSvg").clientWidth,
      fitCamera.h / $("mapSvg").clientHeight,
    );
  const unit = mapUnit,
    radius = 4 * unit,
    font = 10 * unit;
  const selected = (kind, id) =>
    selectedObject?.kind === kind && selectedObject.id === id
      ? " selected"
      : "";
  const attrs = (kind, id) =>
    guest ? '' : `class="map-item${selected(kind, id)}" data-object-kind="${kind}" data-object-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(kind.slice(0, -1) + " " + id)}"`;
  const label = (id, x, y, anchor = "start") =>
    `<text class="map-label" x="${x}" y="${y}" text-anchor="${anchor}" font-size="${font}">${esc(id)}</text>`;
  html(
    "mapPaths",
    map.paths
      .map((path) => {
        const a = byId.get(path.source),
          b = byId.get(path.target);
        if (!validXY(a) || !validXY(b)) return "";
        const start = pointXY(a),
          end = pointXY(b),
          controls = (path.controlPoints || []).filter(validXY).map(pointXY);
        let d = `M${start.join(" ")}`,
          schematic = false;
        if (path.connectionType === "BEZIER" && controls.length === 1)
          d += ` Q${controls[0].join(" ")} ${end.join(" ")}`;
        else if (path.connectionType === "BEZIER_3" && controls.length === 2)
          d += ` C${controls.map((p) => p.join(" ")).join(" ")} ${end.join(" ")}`;
        else {
          if (
            path.connectionType &&
            path.connectionType !== "DIRECT" &&
            !controls.length
          )
            schematic = true;
          d +=
            controls.map((p) => ` L${p.join(" ")}`).join("") +
            ` L${end.join(" ")}`;
        }
        return `<g ${attrs("paths", path.id)}><title>${esc(path.label || path.id)}${schematic ? " · Schematic: geometry not provided" : ""}</title><path class="path-hit" d="${d}"/><path class="map-path${path.locked ? " locked" : ""}${schematic ? " schematic" : ""}" d="${d}" ${path.maxVelocity > 0 ? 'marker-end="url(#route-arrow)"' : ""} ${path.maxReverseVelocity > 0 ? 'marker-start="url(#route-arrow)"' : ""}/></g>`;
      })
      .join(""),
  );
  html(
    "mapPoints",
    map.points
      .filter(validXY)
      .map((p) => {
        const [x, y] = pointXY(p);
        return `<g ${attrs("points", p.id)}><circle class="point-shape" cx="${x}" cy="${y}" r="${radius}"/>${label(p.label || p.id, x + 8 * unit, y - 9 * unit)}</g>`;
      })
      .join(""),
  );
  html(
    "mapStations",
    map.stations
      .filter(validXY)
      .map((s) => {
        const [x, y] = pointXY(s);
        const links = (s.links || [])
          .map((id) => byId.get(id))
          .filter(validXY)
          .map((p) => {
            const [a, b] = pointXY(p);
            return `<path class="station-link" d="M${x} ${y} L${a} ${b}"/>`;
          })
          .join("");
        const linkedPoint = (s.links || [])
          .map((id) => byId.get(id))
          .find(validXY);
        const labelSide = linkedPoint && s.x < linkedPoint.x ? -1 : 1;
        return `<g ${attrs("stations", s.id)}>${links}<rect class="station-shape" x="${x - 6 * unit}" y="${y - 6 * unit}" width="${12 * unit}" height="${12 * unit}" rx="${2 * unit}"/>${label(s.label || s.id, x + labelSide * 10 * unit, y + 4 * unit, labelSide < 0 ? "end" : "start")}</g>`;
      })
      .join(""),
  );
  const hasVehicleGeometry = renderLiveVehicles();
  const hasGeometry =
    !!displayedBackground ||
    map.points.some(validXY) ||
    map.stations.some(validXY) ||
    hasVehicleGeometry;
  $("mapEmpty").hidden = hasGeometry;
  $("warehouseMap").querySelector(".map-controls").hidden = !hasGeometry;
  $("warehouseMap").querySelector(".map-compass").hidden = !hasGeometry;
  $("mapEmptyTitle").textContent =
    guest ? "等待已核实的仿真地图" : modelError && !model
      ? "运行模型不可用"
      : model
        ? "运行模型为空"
        : "等待工作区连接";
  $("mapEmptyDescription").textContent =
    guest ? "地图和车辆位置将在当前发布版本核实后显示。" : modelError && !model
      ? "运行模型读取失败，请检查连接并刷新。"
      : model
        ? connected()
          ? "服务已连接，但运行模型为空。请在地图与发布查看草稿入口；草稿保存不会发布。"
          : "The plant model is empty. 等待当前车队反馈。"
        : "等待运行模型。";
  $("modelName").textContent = displayedModel
    ? (displayedModel.name && displayedModel.name !== "unnamed" ? displayedModel.name : "Empty model") +
      (guest || modelFresh ? "" : " · stale")
    : guest ? "等待发布地图" : "Waiting for model";
  for (const [id, items] of [
    ["pointCount", map.points],
    ["pathCount", map.paths],
    ["stationCount", map.stations],
  ])
    $(id).textContent = displayedModel ? items.length : "—";
  $("setupServer").classList.toggle("complete", connected());
  $("setupModel").classList.toggle(
    "complete",
    map.points.length > 0 && modelFresh,
  );
  $("setupVehicles").classList.toggle(
    "complete",
    robots.length > 0 && connected(),
  );
  overviewVideo?.render();
}
function renderLiveVehicles() {
  const poseUI = window.LiveVehiclePoses;
  const guest = guestOverview();
  const simulation = (connectionCapabilities || api.capabilities)?.environment === "SIM";
  const caption = $("livePoseCaption");
  let vehicles, message;
  if (guest) {
    const observation = guestObservation();
    const live = poseUI?.view(guestPoseMonitor?.snapshot(), observation.model ? observation.map : null);
    vehicles = live?.vehicles || [];
    message = observation.unavailable ? poseUI?.statusText.SOURCE_UNAVAILABLE :
      observation.state && !observation.map ? poseUI?.statusText.NO_RELEASE :
      !observation.model ? poseUI?.statusText.MAP_PENDING :
      live?.message || vehicles.map((v) => `${v.id}：${v.estimateText} · ${v.truthText}`).join("；");
  } else if (simulation) {
    const backgroundMatches = background?.source !== "published-scene" || background.releaseId === synchronizedReleaseId;
    const kernelDrift = [publicationStatus, simulationRunView?.controller.state?.status].some((status) =>
      status?.currentAdmission?.releaseId === synchronizedReleaseId &&
      status.currentAdmission.blockers?.includes("SIM_KERNEL_DRIFT"));
    const releaseId = modelFresh && backgroundMatches && !synchronizingReleaseId && !kernelDrift
      ? synchronizedReleaseId : null;
    const live = poseUI?.view(livePoseMonitor?.snapshot(), releaseId);
    vehicles = api.authorized ? live?.vehicles || [] : [];
    message = api.authorized ?
      live?.message || vehicles.map((v) => `${v.id}：${v.estimateText} · ${v.truthText}`).join("；") :
      poseUI?.statusText.AUTH_REQUIRED;
  } else {
    vehicles = connected() ? robots.filter((r) => !r.stale && validXY(r)).map((r) =>
      ({ id: r.id, estimate: r, estimateText: "openTCS 报告位置" })) : [];
    message = vehicles.length ? "车辆位置来源：openTCS 报告位置。" :
      stateReceived ? "openTCS 车辆位置未提供或已过期。" : "等待车辆位置。";
  }
  caption.hidden = !message;
  setIfChanged(caption, "textContent", message || "");
  const unit = mapUnit;
  const markers = vehicles.map(({ id, estimate, truth, estimateText, truthText }) => {
    const labelPose = estimate || truth;
    if (!labelPose) return "";
    const [x, y] = pointXY(labelPose);
    const selected = selectedObject?.kind === "robots" && selectedObject.id === id ? " selected" : "";
    const orientation = estimate && Number.isFinite(estimate.yaw) ? poseUI.svgRotation(estimate.yaw) : 0;
    const estimateMarker = estimate ?
      `<circle class="vehicle-ring" cx="${x}" cy="${y}" r="${15 * unit}"/><g transform="translate(${x} ${y}) rotate(${orientation})"><rect class="vehicle-shape" x="${-8 * unit}" y="${-6 * unit}" width="${16 * unit}" height="${12 * unit}" rx="${3 * unit}"/>${simulation ? `<path class="vehicle-heading" d="M${2 * unit} ${-3 * unit} L${6 * unit} 0 L${2 * unit} ${3 * unit}"/>` : ""}</g>` : "";
    let truthMarker = "";
    if (truth) {
      const [tx, ty] = pointXY(truth);
      truthMarker = `<g transform="translate(${tx} ${ty}) rotate(${poseUI.svgRotation(truth.yaw)})"><circle class="vehicle-truth" r="${11 * unit}"/><path class="vehicle-truth" d="M${11 * unit} 0 h${5 * unit}"/></g>`;
    }
    const interaction = guest ? "" : ` data-object-kind="robots" data-object-id="${esc(id)}" tabindex="0" role="button" aria-label="车辆 ${esc(id)}"`;
    return `<g class="map-vehicle${guest ? "" : " map-item" + selected}"${interaction}><title>${esc([id, estimateText, truthText].filter(Boolean).join(" · "))}</title>${estimateMarker}${truthMarker}<text class="map-label" x="${x - 10 * unit}" y="${y + 22 * unit}" font-size="${10 * unit}">${esc(id)}</text></g>`;
  }).join("");
  const layer = $("robotMarkers");
  const focused = document.activeElement;
  const focusedId = focused?.parentElement === layer ? focused.dataset.objectId : null;
  if (setIfChanged(layer, "innerHTML", markers)) {
    if (focusedId) [...layer.children].find((item) => item.dataset.objectId === focusedId)?.focus();
  }
  return !!markers;
}
function render() {
  renderFleet();
  renderInspector();
  renderControls();
  renderMap();
  renderPortal();
}
function replayLinkTarget() {
  const query = new URLSearchParams(location.hash.split('?')[1]);
  const kind = query.get('kind'), id = query.get('id');
  if (['run','scenario'].includes(kind) && /^[-A-Za-z0-9_.:]{1,128}$/.test(id || ''))
    return {kind, id, at: Number(query.get('at')) || 0};
  return null;
}
function liveWorkbenchVisible(route) {
  return route === 'simulation' && !replayActive && !replayLinkTarget();
}
function syncObservationRoute(route) {
  const workbench = liveWorkbenchVisible(route);
  if (!workbench) environmentView?.setVisible(false);
  faultView?.setVisible(workbench && $("simFaultPanel").open);
  overviewVideo?.setActive(route === 'operations' && !replayActive);
  overviewVideo?.refreshObservation();
  if (!!guestOverview() !== lastGuestOverview) renderMap();
  if (workbench) environmentView?.setVisible(true);
}
function renderPortal() {
  const historyRoute=PortalState.route(location.hash);
  taskHistoryView?.setVisible(historyRoute==='missions'&&!replayActive);
  eventHistoryView?.setVisible(historyRoute==='events'&&!replayActive);
  $("sidebarFleet").hidden=replayActive;
  $("sidebarModelTree").hidden=replayActive;
  $("portalContext").hidden=replayActive;
  $("replayContextNote").hidden=!replayActive;
  $("simulationEnvironmentView").hidden=replayActive;
  $("staleBanner").hidden=replayActive||!stateReceived||connected();
  sceneHistoryView?.setVisible(PortalState.route(location.hash)==='maps'&&!replayActive&&$("sceneHistoryPanel").open);
  sceneLibraryView?.setVisible(PortalState.route(location.hash)==='maps'&&!replayActive);
  syncObservationRoute(historyRoute);
  overviewVideo?.render();
  if(replayActive){
    document.querySelector('.environment-label').textContent='历史复盘 / 非实时';
    $("headerView").textContent=$("viewTitle").textContent='运行复盘';
    $("viewDescription").textContent='查看已记录作业的过程与处理结果。';
    $("connectionPill").className='connection-pill historical';
    html("connectionPill",'<i></i><span>历史记录视图 · 非实时</span>');
    $("attentionPanel").hidden=true;
    return;
  }
  let items = PortalState.attention({ received: stateReceived, connected: connected(),
    modelFresh, modelError, bootError, robots, stationCount: model?.stations?.length || 0,
    snapshot: receiptSnapshot });
  if (lastActionError) items.unshift({ kind: "error", text: "操作未完成：" + lastActionError, route: "events" });
  const retired=publicationStatus?.activePublication?.status==='RETIRED';
  if(retired){items=items.filter(item=>!item.text.startsWith('车辆 '));items.unshift({text:'仿真版本已停用，虚拟车辆当前不可接单。需要验证时准备服务并发布场景。',route:'simulation'});}
  if (publicationBlockReason&&!retired) items.unshift({ kind:"error",text:publicationBlockReason,route:"maps" });
  if (publicationSourceBlock) items.unshift({ text:publicationSourceBlock,route:"maps" });
  if (receiptSnapshot.writeBlockedReason && (!guestOverview() || receiptSnapshot.storageError || !receiptSnapshot.deploymentConfirmed))
    items.unshift({ text: "当前仅可查询：" + receiptSnapshot.writeBlockedReason, route: "events" });
  $("attentionPanel").hidden = items.length === 0;
  html("attentionList", items.map(item => `<li class="${item.kind === "error" ? "attention-error" : ""}"><span>${esc(item.text)}</span> <a href="#/${item.route}">查看</a></li>`).join(""));
  const admittedRelease=publicationStatus?.currentAdmission?.ready===true ? publicationStatus.currentAdmission.releaseId : null;
  $("portalModelState").textContent = modelFresh ? `模型：${model?.name || "未命名"} · ${Math.floor((Date.now() - modelReadAt) / 1000)} 秒前读取${admittedRelease?"":"（发布版本未提供）"}` : modelError ? "模型：读取失败 / 不新鲜" : "模型：等待读取";
  if (admittedRelease) {
    $("portalModelState").textContent += ` · 当前准入版本 ${admittedRelease.slice(0,12)}…`;
    $("portalModelState").title=admittedRelease;
  }
  if (connectionCapabilities?.environment==="SIM") {
    const activeProfile=publicationStatus?.releases?.find(r=>r.releaseId===admittedRelease)?.profileId;
    $("portalOriginState").textContent=`来源：隔离仿真 SIM · ${connectionCapabilities.targetId || "目标未提供"} · ${activeProfile || connectionCapabilities.profileId || "能力配置未提供"}`;
    document.querySelector('.environment-label').textContent="SIM · 隔离仿真";
  }
  $("portalSessionState").textContent = api.authorized
    ? receiptSnapshot.canWrite ? "操作员已登录 · 可提交操作" : "操作员已登录 · 当前仅可查询"
    : api.portalRole === "automation" ? "自动化身份 · 当前仅可查看" : "仅查看 · 操作员未登录";
  const age = Number.isFinite(upstreamAgeSeconds) && lastStateAt ? upstreamAgeSeconds + (Date.now() - lastStateAt) / 1000 : null;
  $("portalSourceAge").textContent = `openTCS 快照年龄：${age == null ? "未知" : age.toFixed(1) + " 秒"} · 本页接收：${lastStateAt ? Math.floor((Date.now() - lastStateAt) / 1000) + " 秒前" : "尚未收到"}`;
}
const api = new FleetAPI(
  (state) => {
    const first = !stateReceived;
    stateReceived = true;
    robots = state.robots || [];
    orders = state.orders || [];
    upstreamOnline = Boolean(state.upstreamOnline);
    upstreamAgeSeconds = Number.isFinite(state.upstreamAgeSeconds) ? state.upstreamAgeSeconds : null;
    lastStateAt = Date.now();
    if (!robots.some((r) => r.id === selectedRobotId))
      selectedRobotId = robots[0]?.id || null;
    if (
      selectedObject?.kind === "robots" &&
      !robots.some((r) => r.id === selectedObject.id)
    )
      selectedObject = null;
    if (first && robots.length) fitMap();
    render();
  },
  (online) => {
    if (streamOnline !== online) {
      log(
        online
          ? "Live fleet connection established."
          : "Live feedback interrupted. Waiting to reconnect.",
        !online,
      );
    }
    streamOnline = online;
    render();
  },
  (snapshot) => {
    const authorizedBefore = receiptSnapshot.authorized;
    receiptSnapshot = snapshot;
    if (lastActionRequestId && snapshot.records.some(record => record.envelope.requestId === lastActionRequestId && record.status === "ACCEPTED")) {
      lastActionError = "";
      lastActionRequestId = null;
    }
    if (portalReady) {
      connectionCapabilities=api.capabilities || connectionCapabilities;
      initializeServerHistory();
      taskHistoryView?.authorizationChanged();
      eventHistoryView?.authorizationChanged();
      initializeEnvironment();
      initializeFaults();
      faultView?.refresh();
      initializeSceneHistory();
      sceneHistoryView?.authorizationChanged();
      initializeSceneLibrary();
      initializeMapPublishing();
      initializeSimulationRuns();

      initializeScenarioBoard();
      renderControls();
      renderPortal();
      receiptView?.render();
      mapReleaseView?.authorizationChanged();
      simulationRunView?.authorizationChanged();
      scenarioView?.authorizationChanged();
      environmentView?.authorizationChanged();
      sceneLibraryView?.authorizationChanged();
      if (snapshot.authorized && !authorizedBefore) queueMicrotask(restoreReplayLink);
    }
  },
);
window.fleetPortalApi = api;
receiptSnapshot = api.receiptSnapshot?.() || receiptSnapshot;
receiptView = window.CommandReceipts?.mount($("receiptView"), api) || null;
portalReady = true;
function initializeServerHistory(){
  if(!window.ServerHistoryUI||!receiptSnapshot.deploymentConfirmed)return;
  if(!taskHistoryView)taskHistoryView=window.ServerHistoryUI.mount($("serverTasksHistory"),api,{kind:'tasks',onReplay:openReplay});
  if(!eventHistoryView)eventHistoryView=window.ServerHistoryUI.mount($("serverEventsHistory"),api,{kind:'events',onReplay:openReplay,onTask(target){setView('missions');taskHistoryView.controller.submit({q:target.q});}});
}
initializeServerHistory();
function initializeEnvironment(){
  if(!window.SimEnvironmentUI||!receiptSnapshot.deploymentConfirmed||environmentScope===receiptSnapshot.scope)return;
  environmentView?.destroy();environmentScope=receiptSnapshot.scope;
  const viewerPanel=$("simulationViewerPanel");
  environmentView=window.SimEnvironmentUI.mount($("simulationEnvironmentView"),api,{
    initialVisible: liveWorkbenchVisible(PortalState.route(location.hash)),
    viewerContainer:$("simulationViewerHost"),
    onViewerChange(open){viewerPanel.hidden=!open;$("simulationDemoGrid").classList.toggle("has-viewer",open);},
    onViewerReveal(){viewerPanel.scrollIntoView?.({block:"start"});},
    onObservationChange(value){overviewVideo?.setObservation(value);},
  });
  overviewVideo?.refreshObservation();
}
initializeEnvironment();
// Per-robot SIM fault panel; polls only while its panel is open on the live workbench.
function initializeFaults(){
  if(!window.SimFaultUI||!receiptSnapshot.deploymentConfirmed||faultScope===receiptSnapshot.scope)return;
  faultView?.destroy();faultScope=receiptSnapshot.scope;
  const panel=$("simFaultPanel");
  faultView=window.SimFaultUI.mount($("simFaultView"),api,{
    initialVisible: panel.open&&liveWorkbenchVisible(PortalState.route(location.hash)),
    onSupportChange(supported){panel.hidden=!supported;},
  });
}
initializeFaults();
$("simFaultPanel").addEventListener('toggle',()=>faultView?.setVisible($("simFaultPanel").open&&liveWorkbenchVisible(PortalState.route(location.hash))));
function initializeSceneHistory(){
  if(!window.SceneHistoryUI||!receiptSnapshot.deploymentConfirmed||sceneHistoryView)return;
  sceneHistoryView=window.SceneHistoryUI.mount($("sceneHistoryView"),api,{previewSVG:window.SceneLibraryUI?.previewSVG,onReplay:openReplay,onTasks(target){setView('missions');taskHistoryView?.controller.submit({q:target.q});}});
}
initializeSceneHistory();
$("sceneHistoryPanel").addEventListener('toggle',()=>sceneHistoryView?.setVisible(PortalState.route(location.hash)==='maps'&&!replayActive&&$("sceneHistoryPanel").open));
function initializeSceneLibrary(){
  if(!window.SceneLibraryUI||!receiptSnapshot.deploymentConfirmed||sceneLibraryScope===receiptSnapshot.scope)return;
  sceneLibraryView?.destroy();sceneLibraryScope=receiptSnapshot.scope;
  sceneLibraryView=window.SceneLibraryUI.mount($("sceneLibraryView"),api,{onSelectScene:id=>sceneHistoryView?.selectScene(id),onOpenHistory(){const panel=$("sceneHistoryPanel");panel.open=true;sceneHistoryView?.setVisible(true);panel.scrollIntoView({block:'start',behavior:'smooth'});}});
}
initializeSceneLibrary();
function initializeMapPublishing() {
  if (!window.MapReleaseUI || !receiptSnapshot.deploymentConfirmed || mapReleaseScope===receiptSnapshot.scope) return;
  if (mapReleaseView?.controller.state.busy) {publicationSourceBlock="发布操作进行中，不能切换连接身份。";return;}
  mapReleaseView?.destroy();
  mapReleaseScope=receiptSnapshot.scope;
  publicationStatus=null;publicationBlockReason="";publicationSourceBlock="";
  mapReleaseView = window.MapReleaseUI.mount($("mapReleaseView"), api, {
  summaries: [$("fleetReleaseSummary"), $("simulationReleaseSummary")],
  onState(state) {
    clearInactiveSceneBackground(state.status,state.statusFresh);
    publicationStatus=state.status;
    publicationBlockReason = PortalState.publicationBlock(state);
    if (state.statusFresh) synchronizePublishedMap(state.status);
    renderControls();
    renderPortal();
    renderLiveVehicles();
    restoreReplayLink();
  },
  }) || null;
}
initializeMapPublishing();
function initializeSimulationRuns() {
  if (!window.SimulationRunUI || !receiptSnapshot.deploymentConfirmed || simulationRunScope===receiptSnapshot.scope) return;
  if (simulationRunView?.controller.state.busy) return;
  simulationRunView?.destroy();
  simulationRunScope=receiptSnapshot.scope;
  simulationRunView=window.SimulationRunUI.mount($("simulationRunView"),api,{operations:$("rtsRunView"),onReplay:openReplay,onState(state){
    clearInactiveSceneBackground(state.status,state.fresh);
    if (state.fresh) synchronizePublishedMap(state.status);
    renderMap();scenarioView?.render();
  }});
}
initializeSimulationRuns();
function openReplay(target) {
  if(!replayView)return;
  const params=new URLSearchParams({kind:target.kind,id:target.id});
  history.replaceState(null,'','#/simulation?'+params);
  setView('simulation',false);
  replayView.open(target);
}
function initializeScenarioBoard() {
  if(!window.ScenarioUI||!window.ReplayUI||!receiptSnapshot.deploymentConfirmed||scenarioScope===receiptSnapshot.scope)return;
  if(scenarioView?.controller.state.busy)return;
  scenarioView?.destroy();replayView?.destroy();replayActive=false;$("simulationLiveBoard").hidden=false;$("liveWorkspaceActions").hidden=false;scenarioScope=receiptSnapshot.scope;
  replayView=window.ReplayUI.mount($("replayView"),{loadReplay:async(target,options)=>{const data=await window.ReplayUI.loadReplay(api,target,options);return data;},onPosition(time){if(replayActive){const u=new URLSearchParams(location.hash.split('?')[1]);u.set('at',time.toFixed(1));history.replaceState(null,'','#/simulation?'+u);}},onOpen(){replayActive=true;simulationRunView?.setReadPaused?.(true);scenarioView?.setReadPaused?.(true);$("simulationLiveBoard").hidden=true;$("liveWorkspaceActions").hidden=true;renderPortal();},onClose(){if(location.hash.startsWith('#/simulation?'))history.replaceState(null,'','#/simulation');replayActive=false;simulationRunView?.setReadPaused?.(false);scenarioView?.setReadPaused?.(false);$("simulationLiveBoard").hidden=false;$("liveWorkspaceActions").hidden=false;setView(PortalState.route(location.hash),false);render();}});
  queueMicrotask(restoreReplayLink);
  scenarioView=window.ScenarioUI.mount($("scenarioView"),api,{onReplay:openReplay,getRuns:()=>simulationRunView?.controller.state.observedRuns||[],onRun(id){$("singleTaskPanel").open=true;simulationRunView?.controller.act(async()=>{await simulationRunView.controller.inspect(id);$("simulationRunView").focus?.({preventScroll:true});$("simulationRunView").scrollIntoView?.({block:"start",behavior:"auto"});}).catch(()=>{});}});
}
initializeScenarioBoard();
$("backToScenarioBoard").addEventListener("click",()=>{$("scenarioAdvancedPanel").open=true;$("scenarioView").focus?.({preventScroll:true});$("scenarioView").scrollIntoView?.({block:"start",behavior:"auto"});});
function synchronizePublishedMap(status) {
  const admission = status?.currentAdmission;
  const releaseId = admission?.releaseId;
  const published = status?.activePublication;
  const current = admission?.ready === true ||
    (published?.status === "READY" && published.releaseId === releaseId &&
      !admission?.blockers?.includes("SIM_KERNEL_DRIFT"));
  if (current && releaseId && releaseId !== synchronizedReleaseId && releaseId !== synchronizingReleaseId)
    refreshPublishedSources(releaseId);
}
async function refreshPublishedSources(releaseId) {
  const generation=++publishedSourceGeneration;
  synchronizingReleaseId=releaseId;
  publicationSourceBlock="版本已核验，正在刷新运行模型与导航目的站。";
  try {
    const next=await api.request("layout");
    if(!Array.isArray(next.points)) throw Error("目的站配置响应无效");
    if(generation!==publishedSourceGeneration) return;
    if(loadingModel) throw Error("等待当前模型读取完成，请稍后再核对发布版本");
    layout=next;
    await loadModel();
    if(generation!==publishedSourceGeneration)return;
    await loadBackground();
    if(!modelFresh) throw Error("运行模型尚未读取成功");
    synchronizedReleaseId=releaseId;
    publicationSourceBlock="";
  } catch(error) {
    if(generation===publishedSourceGeneration) publicationSourceBlock="发布版本已更新，但导航目的站或模型读取失败："+error.message;
  } finally {
    if(generation===publishedSourceGeneration) synchronizingReleaseId=null;
    renderControls(); renderPortal(); renderMap();
  }
}
async function loadModel(report = false) {
  if (loadingModel) return;
  loadingModel = true;
  $("refreshModel").disabled = true;
  try {
    const next = await api.model();
    if (
      !Array.isArray(next.points) ||
      !Array.isArray(next.paths) ||
      !Array.isArray(next.stations)
    )
      throw new Error("Invalid plant model response");
    const changed = JSON.stringify(model) !== JSON.stringify(next);
    model = next;
    modelFresh = true;
    modelReadAt = Date.now();
    modelError = "";
    if (changed) fitMap();
    if (report) {
      log("Plant model refreshed.");
      notify("Plant model refreshed.");
    }
  } catch (error) {
    modelFresh = false;
    if (modelError !== error.message)
      log("运行模型不可用. " + error.message, true);
    modelError = error.message;
    if (report) notify("Unable to refresh the plant model.", true);
  } finally {
    loadingModel = false;
    $("refreshModel").disabled = false;
    render();
  }
}
function setView(view, updateHash = true) {
  const aliases = { overview: "operations", vehicles: "fleet", orders: "missions", activity: "events" };
  const route = PortalState.route("#/" + (aliases[view] || view));
  if (updateHash && location.hash !== "#/" + route) {
    location.hash = "/" + route;
    return;
  }
  const copy = {
    operations: ["运行总览", "实时运行概况，数据来源与更新时间可查。"],
    fleet: ["车辆与连接", "在线、定位、版本就绪与允许接单不是同一个状态。"],
    missions: ["搬运任务", "检索服务器记录的导航任务与操作，查看结果、处理原因和历史回放。"],
    events: ["事件与对账", "按车辆、时间和事件来源检索服务器记录，关联任务并查看处理过程。"],
    maps: ["地图与发布", "编辑与冻结地图草稿，受控发布到当前隔离仿真并核对版本与准入。"],
    simulation: ["仿真工作台", "准备服务、发布场景、下达任务，在真实 3D 画面和运行记录中核对结果。"],
  };
  view = {operations:"overview", fleet:"vehicles", missions:"orders", events:"activity", maps:"maps", simulation:"simulation"}[route];
  $("workspace").dataset.view = view;
  $("workspace").dataset.route = route;
  $("headerView").textContent = $("viewTitle").textContent = copy[route][0];
  document.title = "Fleetserver · " + copy[route][0];
  $("viewDescription").textContent = copy[route][1];
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === route);
    if (button.dataset.view === route)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (view === "orders" || view === "activity") setDataTab(view);
  $("mapsWorkspace").hidden = route !== "maps";
  if(route!=="simulation"&&replayActive)replayView?.close();
  $("simulationWorkspace").hidden = route !== "simulation";
  $("rtsWorkspace").hidden = route !== "operations";
  $("receiptWorkspace").hidden = !["missions", "events"].includes(route);
  if (route === "missions") setInspectorTab("dispatch");
  receiptView?.render();
  $("serverTasksHistory").hidden=route!=='missions';$("serverEventsHistory").hidden=route!=='events';
  taskHistoryView?.setVisible(route==='missions'&&!replayActive);eventHistoryView?.setVisible(route==='events'&&!replayActive);
  sceneHistoryView?.setVisible(route==='maps'&&!replayActive&&$("sceneHistoryPanel").open);
  sceneLibraryView?.setVisible(route==='maps'&&!replayActive);
  syncObservationRoute(route);
  if (view === "overview") renderMap();
}
function setDataTab(tab) {
  const activity = tab === "activity";
  $("ordersContent").hidden = activity;
  $("activityContent").hidden = !activity;
  $("ordersTab").setAttribute("aria-selected", String(!activity));
  $("activityTab").setAttribute("aria-selected", String(activity));
}
function setInspectorTab(tab) {
  const dispatch = tab === "dispatch";
  $("dispatchContent").hidden = !dispatch;
  $("detailsContent").hidden = dispatch;
  $("dispatchTab").setAttribute("aria-selected", String(dispatch));
  $("detailsTab").setAttribute("aria-selected", String(!dispatch));
}
function selectObject(kind, id) {
  selectedObject = { kind, id };
  if (kind === "robots") selectedRobotId = id;
  if (!(kind==="robots"&&PortalState.route(location.hash)==="missions"&&$("dispatchTab").getAttribute("aria-selected")==="true")) setInspectorTab("details");
  render();
  openObjectDrawer();
}
function renderAccess() {
  $("accessCredentials").hidden = api.authorized;
  $("controlKey").disabled = api.authorized;
  $("saveAccess").hidden = api.authorized;
  $("clearAccess").hidden = !(api.authorized || api.portalRole || api.logoutPending);
  const capabilities = connectionCapabilities || api.capabilities;
  $("accessGuestObservation").hidden = api.authorized || !api.portalSessionURL?.() || capabilities?.environment !== "SIM" ||
    !capabilities.targetId;
  $("accessStatus").textContent = api.authorized
    ? receiptSnapshot.canWrite ? "操作员已登录，可在符合操作条件时提交请求。" : receiptSnapshot.writeBlockedReason || "已登录，当前仅可查询。"
    : api.portalRole === "automation" ? "当前使用自动化凭据。请使用操作员密钥登录。"
    : "当前可查看公开状态。操作员登录后可查看受限资料并提交操作。";
}
function accessError(error) {
  return error.code === "PORTAL_SESSION_HTTP" || error.code === "PORTAL_SESSION_UNAVAILABLE" || error.code === "INVALID_PORTAL_SESSION"
    ? error.message : error.status === 401 || error.status === 403 ? "操作密钥无效或没有操作员权限。" : "登录暂不可用，请稍后重试。";
}
function openAccess() {
  $("accessError").hidden = true;
  $("controlKey").value = "";
  $("accessDialog").showModal();
}
async function action(callback) {
  if (busy) return;
  busy = true;
  renderControls();
  try {
    await callback();
    lastActionError = "";
    lastActionRequestId = null;
  } catch (error) {
    lastActionError = error.message;
    lastActionRequestId = error.requestId || null;
    log(error.message, true);
    notify(error.message, true);
  } finally {
    busy = false;
    renderControls();
    renderPortal();
  }
}
for (const id of ["robotList", "vehicleTable"])
  $(id).addEventListener("click", (event) => {
    const row = event.target.closest("[data-robot-id]");
    if (row) selectObject("robots", row.dataset.robotId);
  });
$("mapSvg").addEventListener("click", (event) => {
  const item = event.target.closest("[data-object-id]");
  if (item) selectObject(item.dataset.objectKind, item.dataset.objectId);
});
$("mapSvg").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    const item = event.target.closest("[data-object-id]");
    if (item) {
      event.preventDefault();
      selectObject(item.dataset.objectKind, item.dataset.objectId);
    }
  }
});
$("robotSearch").addEventListener("input", renderFleet);
$("dispatchRobot").addEventListener("change", (event) => {
  selectedRobotId = event.target.value;
  selectedObject = { kind: "robots", id: selectedRobotId };
  render();
});
for (const button of document.querySelectorAll(".nav-item[data-view]"))
  button.addEventListener("click", () => setView(button.dataset.view));
$("ordersTab").addEventListener("click", () => setDataTab("orders"));
$("activityTab").addEventListener("click", () => setDataTab("activity"));
$("detailsTab").addEventListener("click", () => setInspectorTab("details"));
$("dispatchTab").addEventListener("click", () => setInspectorTab("dispatch"));
$("accessButton").addEventListener("click", openAccess);
$("inspectorAccessButton").addEventListener("click", openAccess);
$("mapSetupButton").addEventListener("click", () =>
  $("setupDialog").showModal(),
);
for (const button of document.querySelectorAll("[data-close-dialog]"))
  button.addEventListener("click", () => button.closest("dialog").close());
$("accessDialog").addEventListener("close", () => {
  $("controlKey").value = "";
});
$("accessGuestObservation").querySelector("a").addEventListener("click", () => $("accessDialog").close());
$("accessForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (api.authorized || api.portalSessionChanging) return;
  const enteredKey = $("controlKey").value.trim();
  $("controlKey").value = "";
  $("accessError").hidden = true;
  $("saveAccess").disabled = true;
  $("clearAccess").disabled = true;
  try {
    await api.loginPortal(enteredKey);
    if (!api.authorized) return;
    $("accessDialog").close();
    notify("操作员已登录。");
  } catch (error) {
    $("accessError").textContent = accessError(error);
    $("accessError").hidden = false;
  } finally {
    $("saveAccess").disabled = false;
    $("clearAccess").disabled = false;
    renderControls();
  }
});
$("clearAccess").addEventListener("click", async () => {
  if (api.portalSessionChanging) return;
  $("clearAccess").disabled = true;
  $("saveAccess").disabled = true;
  $("accessError").hidden = true;
  try {
    await api.logoutPortal();
    $("accessDialog").close();
    notify("已退出，当前仅可查看。");
  } catch (_) {
    $("accessError").textContent = "未能确认已退出，请重试。";
    $("accessError").hidden = false;
  } finally {
    $("clearAccess").disabled = false;
    $("saveAccess").disabled = false;
    renderControls();
  }
});
$("newOrderButton").addEventListener("click", () => {
  setView("missions");
  setInspectorTab("dispatch");
  openObjectDrawer();
  if (!api.authorized) openAccess();
});
$("navigateForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("sendOrderButton").disabled) return;
  action(async () => {
    const content = { to: $("toPoint").value, robotId: selectedRobotId };
    if (api.hasUnresolvedCreate?.() || PortalState.unresolved(receiptSnapshot).length)
      throw new Error("有未决导航请求。请查询原 requestId，不能创建第二个意图。");
    const destination = destinations().find(point => point.id === content.to);
    if (!destination) throw new Error("目的站已不可用，请刷新模型并重新选择。");
    if ([destination.id, destination.destination].includes(currentRobot()?.location))
      throw new Error("目的站与车辆报告起点相同，请选择其他目的站。");
    const result = await api.order({ ...content, requestId: api.id() });
    log(`Order ${result.id} accepted. Awaiting vehicle execution feedback.`);
    notify("请求已受理，等待车辆执行反馈。");
  });
});
for (const [id, operation] of [
  ["estopButton", "pause"],
  ["resumeButton", "resume"],
])
  $(id).addEventListener("click", () =>
    action(async () => {
      const reviewedIds=robots.map(r=>r.id),names=reviewedIds.join('、');
      if(!await reviewFleetOperation(operation,names))return;
      const result = await api.fleet(operation,reviewedIds);
      log(
        `${operation}: ${result.results.map((r) => `${r.id} ${r.accepted ? "requested" : r.detail}`).join("; ")}. Await vehicle confirmation.`,
      );
      notify(
        result.allAccepted
          ? "Request accepted. Awaiting vehicle confirmation."
          : "Some vehicles did not accept the request. See Activity.",
        !result.allAccepted,
      );
    }),
  );
$("cancelOrder").addEventListener("click", () =>
  action(async () => {
    const robot = selectedObject?.kind === "robots"
      ? robots.find(item => item.id === selectedObject.id)
      : null;
    if (!robot?.task) throw new Error("No reported order to withdraw.");
    await api.cancel(robot.task);
    log("Withdrawal requested. Awaiting vehicle confirmation.");
    notify("已请求撤单；等待执行反馈，不代表已停稳。");
  }),
);
$("refreshModel").addEventListener("click", () => loadModel(true));
function zoom(factor) {
  const w = camera.w * factor,
    h = camera.h * factor;
  if (w < fitCamera.w * 0.08 || w > fitCamera.w * 12) return;
  camera = {
    x: camera.x + (camera.w - w) / 2,
    y: camera.y + (camera.h - h) / 2,
    w,
    h,
  };
  applyCamera();
}
$("zoomIn").addEventListener("click", () => zoom(0.8));
$("zoomOut").addEventListener("click", () => zoom(1.25));
$("fitMap").addEventListener("click", () => {
  fitMap();
  renderMap();
});
for (const checkbox of document.querySelectorAll("[data-layer]"))
  checkbox.addEventListener("change", () => {
    $("mapSvg").dataset[checkbox.dataset.layer] = String(checkbox.checked);
  });
for (const button of document.querySelectorAll("[data-map-focus]"))
  button.addEventListener("click", () => {
    const kind=button.dataset.mapFocus,group=model?.[kind]||[],dialog=document.createElement('dialog');dialog.className='object-catalog';dialog.setAttribute('aria-label','运行模型对象');
    const title=document.createElement('h2');title.textContent=({points:'点位',paths:'路线',stations:'停车工位'})[kind]||'对象';dialog.append(title);
    const close=document.createElement('button');close.textContent='关闭';close.className='button';close.onclick=()=>dialog.close();dialog.append(close);
    for(const item of group){const row=document.createElement('button');row.className='button';row.textContent=item.label||item.name||item.id;row.onclick=()=>{dialog.close();selectObject(kind,item.id);};dialog.append(row);}
    if(!group.length){const empty=document.createElement('p');empty.textContent='当前模型没有此类对象。';dialog.append(empty);}
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  });
const svg = $("mapSvg");
let drag = null;
function localPoint(event) {
  const p = svg.createSVGPoint();
  p.x = event.clientX;
  p.y = event.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
svg.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".map-item")) return;
  drag = { id: event.pointerId, point: localPoint(event) };
  svg.setPointerCapture(event.pointerId);
  svg.classList.add("panning");
});
svg.addEventListener("pointermove", (event) => {
  const p = localPoint(event);
  if (drag && drag.id === event.pointerId) {
    camera.x += drag.point.x - p.x;
    camera.y += drag.point.y - p.y;
    applyCamera();
  }
  if (model?.points.length)
    $("mapCoordinates").textContent =
      `X ${(p.x / 60).toFixed(2)} · Y ${(-p.y / 60).toFixed(2)} m`;
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  svg.addEventListener(type, () => {
    drag = null;
    svg.classList.remove("panning");
  });
svg.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY < 0 ? 0.9 : 1.1);
  },
  { passive: false },
);
function clock() {
  $("sessionClock").textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  $("dataFreshness").textContent =
    connected() && lastStateAt
      ? "Live · updated " +
        (Date.now() - lastStateAt < 5000
          ? "just now"
          : Math.floor((Date.now() - lastStateAt) / 1000) + "s ago")
      : stateReceived
        ? "反馈过期"
        : "等待车队状态";
  if (portalReady) renderPortal();
}
window.addEventListener("resize", renderMap);
function restoreRoute() {
  const route = PortalState.route(location.hash.split("?")[0]);
  if (!location.hash.includes("?") && location.hash !== "#/" + route)
    history.replaceState(null, "", "#/" + route);
  setView(route, false);
}
window.addEventListener("hashchange", restoreRoute);
if (window.LiveVehiclePoses) {
  livePoseMonitor = window.LiveVehiclePoses.monitor({
    request: (signal) => api.request("sim-publishing/live-poses", undefined, { signal }),
    active: () => api.authorized && document.visibilityState !== "hidden" &&
      PortalState.route(location.hash) === "operations" &&
      (connectionCapabilities || api.capabilities)?.environment === "SIM" ?
      JSON.stringify([api.scope, api.keyRevision]) : null,
    onChange: renderLiveVehicles,
  });
  setInterval(livePoseMonitor.tick, 150);
  document.addEventListener("visibilitychange", livePoseMonitor.tick);
  if (guestMonitor) {
    guestPoseMonitor = window.LiveVehiclePoses.monitor({
      request: (signal) => window.OverviewVideo.readObservation('/live-poses', signal),
      active: () => {
        const observation = guestObservation();
        return observation?.model ? JSON.stringify([api.scope, observation.map.releaseId, observation.map.mapId]) : null;
      },
      onChange: renderLiveVehicles,
    });
    function refreshGuestObservation() {
      guestMonitor.tick();
      guestPoseMonitor.tick();
      const observation = guestObservation();
      if (observation?.map && !guestMapBackground(observation) && Date.now() >= guestBackgroundRetryAt) {
        guestBackgroundRetryAt = Date.now() + 8000;
        loadBackground();
      }
    }
    setInterval(refreshGuestObservation, 150);
    document.addEventListener('visibilitychange', refreshGuestObservation);
  }
}
restoreRoute();
render();
clock();
setInterval(clock, 1000);
async function boot() {
  try {
    layout = await api.start();
    try { connectionCapabilities=api.capabilities || await api.request("capabilities"); }
    catch (_) { connectionCapabilities=null; }
    bootError = "";
    render();
    await loadModel();
    setInterval(() => loadModel(), 30000);
  } catch (error) {
    if (bootError !== error.message) {
      log("Unable to load the fleet. " + error.message, true);
      bootError = error.message;
    }
    renderPortal();
    setTimeout(boot, 4000);
  }
}
boot();
function clearInactiveSceneBackground(status,fresh) {
  const latest=status?.activePublication;
  if(!fresh||background?.source!=="published-scene"||!latest||typeof latest.status!=="string")return;
  if(!["RETIRED","REJECTED","UNKNOWN"].includes(latest.status)&&!(latest.releaseId!==background.releaseId&&latest.status!=="READY"))return;
  backgroundGeneration++;background=null;
  const image=$("mapBackground");image.onload=null;image.onerror=null;image.removeAttribute("href");
  $("backgroundCaption").textContent="场景导航底图已停止作为当前发布底图。";
  $("backgroundCaption").hidden=false;renderMap();
}
async function loadBackground() {
  const generation=++backgroundGeneration,image=$("mapBackground");
  background=null;image.onload=null;image.onerror=null;image.removeAttribute("href");
  $("backgroundCaption").textContent="正在核对当前导航底图…";
  $("backgroundCaption").hidden=false;
  try {
    const value = await api.request("map-background");
    if(generation!==backgroundGeneration)return;
    if (!value.available) {$("backgroundCaption").textContent="当前没有已发布的导航底图。";renderMap();return;}
    const candidate = value.map,
      image = $("mapBackground");
    const [ox, oy, yaw] = candidate.origin,
      r = candidate.resolution * 60;
    image.setAttribute("width", candidate.width);
    image.setAttribute("height", candidate.height);
    image.setAttribute(
      "transform",
      `matrix(${[r * Math.cos(yaw), -r * Math.sin(yaw), r * Math.sin(yaw), r * Math.cos(yaw), ox * 60 - r * candidate.height * Math.sin(yaw), -oy * 60 - r * candidate.height * Math.cos(yaw)].join(" ")})`,
    );
    image.onload = () => {
      if(generation!==backgroundGeneration)return;
      background = candidate;
      $("backgroundCaption").textContent =
        `导航底图：${background.name} · ${background.resolution} 米/格 · 路网独立叠加`;
      $("backgroundCaption").hidden = false;
      fitMap();
      renderMap();
    };
    image.onerror = () => {
      if(generation!==backgroundGeneration)return;
      image.removeAttribute("href");
      background = null;
      $("backgroundCaption").textContent = "导航底图不可用";
      $("backgroundCaption").hidden = false;
      renderMap();
    };
    image.setAttribute("href", candidate.imageUrl || "/api/v1/map-background/image.png");
  } catch (error) {
    if(generation!==backgroundGeneration)return;
    image.removeAttribute("href");background=null;
    $("backgroundCaption").textContent="导航底图读取失败，请重新核对当前发布版本。";
    renderMap();
    log("导航底图不可用。 " + error.message, true);
  }
}
loadBackground();
function includeStoredUpdateBlockers() {
  return api.authorized || !api.portalSessionURL?.() || api.hasSubmittedInTab?.() === true;
}
window.PortalUpdates?.addGuard('operations',()=>{
  if(busy)return '工作台正在提交操作，请等待本次操作返回；结果不明时到“事件与对账 → 命令回执”核对。';
  const options={includeStored:includeStoredUpdateBlockers()};
  return mapReleaseView?.controller?.updateBlocker?.(options)||simulationRunView?.controller?.updateBlocker?.(options)||scenarioView?.controller?.updateBlocker?.(options)||environmentView?.updateBlocker?.()||scenarioView?.updateBlocker?.()||window.PortalUpdates.apiBlocker(api,options)||'';
});

// Product shell: one object inspector and in-memory, same-origin editor sessions.
const objectDrawer=document.createElement('dialog');objectDrawer.id='objectDrawer';
objectDrawer.setAttribute('aria-label','对象详情与操作');
objectDrawer.innerHTML='<button class="button drawer-close" aria-label="关闭对象详情">关闭</button>';
objectDrawer.append(document.querySelector('.inspector'));document.body.append(objectDrawer);
objectDrawer.querySelector('button').onclick=()=>objectDrawer.close();
const chooseForSimulation=document.createElement('button');chooseForSimulation.className='button';chooseForSimulation.textContent='用所选车辆配置单次验证';objectDrawer.append(chooseForSimulation);
chooseForSimulation.onclick=()=>{if(selectedObject?.kind!=='robots')return;const id=selectedObject.id;if(!simulationRunView||simulationRunView.controller.state.busy)return;simulationRunView.controller.act(async()=>{simulationRunView.controller.selectRobot(id);await simulationRunView.controller.refresh();}).catch(()=>{});setView('simulation');objectDrawer.close();};
function openObjectDrawer(){chooseForSimulation.hidden=selectedObject?.kind!=='robots';if(!objectDrawer.open)objectDrawer.showModal();}
const editorDialog=document.createElement('dialog');editorDialog.id='editorWorkspace';editorDialog.setAttribute('aria-label','场地编辑工作区');document.body.append(editorDialog);
let editorFrame=null;
document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||!['/scene-builder.html','/editor.html'].includes(url.pathname))return;event.preventDefault();editorDialog.replaceChildren();editorFrame=document.createElement('iframe');editorFrame.title=url.pathname.includes('scene-builder')?'场景搭建与路线规划':'ROS地图导入与编辑';url.searchParams.set('embedded','1');editorFrame.src=url.href;editorDialog.append(editorFrame);editorDialog.showModal();});
editorDialog.addEventListener('cancel',event=>{event.preventDefault();editorFrame?.contentWindow.postMessage({type:'fleet-editor-close-request'},location.origin);});
window.addEventListener('message',event=>{if(event.origin!==location.origin||!editorFrame||event.source!==editorFrame.contentWindow)return;if(event.data?.type==='fleet-editor-close'){editorDialog.close();editorDialog.replaceChildren();editorFrame=null;sceneLibraryView?.controller.refresh();if(event.data.view==='simulation'){setView('simulation');simulationRunView?.controller.refresh();}}});
async function restoreReplayLink(){if(replayActive||!replayView||!api.authorized)return;const target=replayLinkTarget();if(target)await replayView.open(target);}

window.PortalUpdates?.addReviewAction?.('operations',()=>{
  const options={includeStored:includeStoredUpdateBlockers()};
  let target=null;
  if(mapReleaseView?.controller?.updateBlocker?.(options))target={route:'maps',id:'mapReleaseView',label:'前往核对原发布'};
  else if(simulationRunView?.controller?.updateBlocker?.(options))target={route:'simulation',id:'singleTaskPanel',label:'前往核对原单次任务'};
  else if(scenarioView?.controller?.updateBlocker?.(options)||scenarioView?.updateBlocker?.())target={route:'simulation',id:'scenarioAdvancedPanel',label:'前往核对原作业方案'};
  else if(environmentView?.updateBlocker?.())target={route:'simulation',id:'simulationEnvironmentView',label:'前往核对原服务操作'};
  else if(window.PortalUpdates.apiBlocker(api,options))target={route:'events',id:'receiptView',label:'前往命令回执'};
  if(!target)return null;
  return {label:target.label,go(){
    if(editorFrame)return '编辑器仍打开，原草稿已保留。请先保存或明确放弃修改，再通过编辑器原有返回入口关闭；返回后再次点击核对入口。';
    if(replayActive)replayView?.close();
    setView(target.route,false);
    if(location.hash!=='#/'+target.route)location.hash='/'+target.route;
    const panel=$(target.id);if(!panel)return '已打开对应页面，暂未定位到原请求区。请按页面中的核对入口读取原记录。';
    if(panel.tagName==='DETAILS')panel.open=true;
    const section=panel.closest?.('details');if(section)section.open=true;
    panel.scrollIntoView?.({block:'start',behavior:'smooth'});
    return '已打开原请求所在区域。这里只查看与核对，不会重发原操作；核对后请再次明确点击更新。';
  }};
});
api.watchPortalSession();
window.PortalUpdates?.ready();

function reviewFleetOperation(operation,names){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='object-catalog';dialog.setAttribute('aria-label','审阅全车运营控制');const title=document.createElement('h2');title.textContent=operation==='pause'?'请求全部车辆运营暂停':'请求全部车辆恢复';const scope=document.createElement('p');scope.textContent='涉及车辆：'+names;const note=document.createElement('p');note.textContent='这是运营控制请求；受理后须核对车辆反馈。它不提供安全急停保证。';const cancel=document.createElement('button');cancel.className='button';cancel.textContent='返回，不发送';const confirm=document.createElement('button');confirm.className='button button-primary';confirm.textContent='确认向全部车辆发送请求';let result=false;cancel.onclick=()=>dialog.close();confirm.onclick=()=>{result=true;dialog.close();};dialog.append(title,scope,note,cancel,confirm);dialog.addEventListener('close',()=>{dialog.remove();resolve(result);});document.body.append(dialog);dialog.showModal();});}
