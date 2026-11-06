/* Live state only. The displayed topology comes from openTCS, never a demo map. */
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
const html = (id, value) => {
  if ($(id).innerHTML !== value) $(id).innerHTML = value;
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
  pendingSubmission = null,
  lastStateAt = null;
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
const number = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : "Unknown";
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
      : robot.status || "Unknown";
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
    ? "check vehicle feedback"
    : "no reported issues";
  $("vehicleNavCount").textContent = robots.length;
  $("orderNavCount").textContent = orders.length;
  $("fleetMode").textContent = `${robots.length} reported`;
  $("connectionPill").className =
    `connection-pill ${online ? "connected" : stateReceived ? "disconnected" : ""}`;
  html(
    "connectionPill",
    `<i></i><span>${online ? "Fleet connected" : stateReceived ? "Feedback unavailable" : "Connecting"}</span>`,
  );
  $("sidebarStatus").className = `server-status ${online ? "connected" : ""}`;
  html(
    "sidebarStatus",
    `<i></i>${online ? "Kernel connected" : "Awaiting live feedback"}`,
  );
  $("staleBanner").hidden = !stateReceived || online;
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
          `<button class="robot-row ${selectedObject?.kind === "robots" && r.id === selectedObject.id ? "active" : ""}" data-robot-id="${esc(r.id)}"><span class="robot-avatar">${icon("robot")}</span><span><strong>${esc(r.id)}</strong><small>${esc(r.location || "Position unknown")}</small></span><i class="robot-dot ${!online || !r.online || r.stale ? "alert" : ""}"></i></button>`,
      )
      .join("") ||
      `<div class="sidebar-empty">${icon(term ? "search" : "robot")}<strong>${term ? "No matching vehicles" : "No vehicles yet"}</strong><p>${term ? "Try a different vehicle name." : "Vehicles appear when reported by the connected fleet."}</p></div>`,
  );
  html(
    "vehicleTable",
    robots
      .map(
        (r) =>
          `<tr><td><button class="table-link" data-robot-id="${esc(r.id)}">${esc(r.id)}</button></td><td>${badge(r)}</td><td>${esc(r.location || "Unknown")}</td><td>${r.battery == null ? "Unknown" : esc(r.battery) + "%"}</td><td>${esc(r.task || "—")}</td></tr>`,
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
        return `<tr><td title="${esc(o.name)}">${esc(o.name)}</td><td>${esc(o.processingVehicle || o.intendedVehicle || "Unassigned")}</td><td>${esc(destinations || "—")}</td><td><span class="status-badge ${o.state === "BEING_PROCESSED" ? "moving" : ""}">${esc(o.state || "Unknown")}</span></td><td>${esc(created)}</td></tr>`;
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
  const robot = currentRobot(),
    key = Boolean(api.key),
    ready = connected();
  $("accessLabel").textContent = key ? "Control session" : "Control access";
  $("inspectorAccess").textContent = key
    ? "Operator session active"
    : "Read-only session";
  $("estopButton").disabled = $("resumeButton").disabled =
    busy || !ready || !key || !robots.length;
  $("newOrderButton").disabled = busy || !ready || !robots.length;
  const choices = destinations(),
    oldDestination = $("toPoint").value;
  html(
    "dispatchRobot",
    robots
      .map((r) => `<option value="${esc(r.id)}">${esc(r.id)}</option>`)
      .join("") || '<option value="">No vehicles available</option>',
  );
  $("dispatchRobot").value = selectedRobotId || "";
  html(
    "toPoint",
    choices
      .map(
        (p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`,
      )
      .join("") || '<option value="">No commissioned destinations</option>',
  );
  if (choices.some((p) => p.id === oldDestination))
    $("toPoint").value = oldDestination;
  $("fromPoint").textContent = robot?.location || "Reported vehicle position";
  let reason = !ready
    ? "Waiting for current fleet feedback."
    : !key
      ? "Enable a control session to send orders."
      : !robot
        ? "Select a vehicle to create an order."
        : !robot.online || robot.stale
          ? "The selected vehicle is not available."
          : robot.paused
            ? "The selected vehicle has a pause request."
            : !modelFresh
              ? "Refresh the plant model before sending an order."
              : !choices.length
                ? "No configured destination matches a station in the loaded plant model."
                : busy
                  ? "Waiting for the request receipt."
                  : pendingSubmission
                    ? "A request is unresolved. Retry the same intent or reconcile its receipt."
                    : "The vehicle starts from its reported position.";
  $("dispatchHint").textContent = reason;
  $("sendOrderButton").disabled =
    busy ||
    !ready ||
    !key ||
    !robot?.online ||
    robot.stale ||
    robot.paused ||
    !modelFresh ||
    !choices.length;
  $("cancelOrder").disabled =
    busy || !ready || !key || selectedObject?.kind !== "robots" || !robot?.task;
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
        robots: "Vehicle",
        points: "Point",
        paths: "Path",
        stations: "Station",
      }[selectedObject.kind];
  if (!object) return;
  $("selectedRobotName").textContent = object.id;
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
      ["Position", object.location || "Unknown"],
      [
        "Coordinates",
        validXY(object)
          ? `${number(object.x)}, ${number(object.y)} m`
          : "Unknown",
      ],
      ["Battery", object.battery == null ? "Unknown" : `${object.battery}%`],
      [
        "Velocity",
        object.velocity == null ? "Unknown" : `${object.velocity} m/s`,
      ],
      ["Order", object.task || "None reported"],
      ["Processing", object.processingState || "Unknown"],
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
          : "Unknown",
      ],
      [
        "Speed limit",
        Number.isFinite(object.maxVelocity)
          ? `${number(object.maxVelocity)} m/s`
          : "Unknown",
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
          `<div><dt>${esc(key)}</dt><dd>${esc(value ?? "Unknown")}</dd></div>`,
      )
      .join(""),
  );
  $("cancelOrder").hidden = selectedObject.kind !== "robots";
}
function applyCamera() {
  $("mapSvg").setAttribute(
    "viewBox",
    `${camera.x} ${camera.y} ${camera.w} ${camera.h}`,
  );
}
function fitMap() {
  const objects = [
    ...(model?.points || []),
    ...(model?.stations || []),
    ...(model?.paths || []).flatMap((p) => p.controlPoints || []),
    ...robots,
  ].filter(validXY);
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
function renderMap() {
  const map = model || { points: [], paths: [], stations: [] },
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
    `class="map-item${selected(kind, id)}" data-object-kind="${kind}" data-object-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(kind.slice(0, -1) + " " + id)}"`;
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
        return `<g ${attrs("paths", path.id)}><title>${esc(path.id)}${schematic ? " · Schematic: geometry not provided" : ""}</title><path class="path-hit" d="${d}"/><path class="map-path${path.locked ? " locked" : ""}${schematic ? " schematic" : ""}" d="${d}" ${path.maxVelocity > 0 ? 'marker-end="url(#route-arrow)"' : ""} ${path.maxReverseVelocity > 0 ? 'marker-start="url(#route-arrow)"' : ""}/></g>`;
      })
      .join(""),
  );
  html(
    "mapPoints",
    map.points
      .filter(validXY)
      .map((p) => {
        const [x, y] = pointXY(p);
        return `<g ${attrs("points", p.id)}><circle class="point-shape" cx="${x}" cy="${y}" r="${radius}"/>${label(p.id, x + 8 * unit, y - 9 * unit)}</g>`;
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
        return `<g ${attrs("stations", s.id)}>${links}<rect class="station-shape" x="${x - 6 * unit}" y="${y - 6 * unit}" width="${12 * unit}" height="${12 * unit}" rx="${2 * unit}"/>${label(s.id, x + labelSide * 10 * unit, y + 4 * unit, labelSide < 0 ? "end" : "start")}</g>`;
      })
      .join(""),
  );
  html(
    "robotMarkers",
    robots
      .filter(validXY)
      .map((r) => {
        const [x, y] = pointXY(r),
          isSelected =
            selectedObject?.kind === "robots" && r.id === selectedObject.id;
        return `<g class="map-item map-vehicle ${isSelected ? "selected" : ""} ${!connected() || r.stale ? "stale" : ""}" data-object-kind="robots" data-object-id="${esc(r.id)}" tabindex="0" role="button" aria-label="Vehicle ${esc(r.id)}"><circle class="vehicle-ring" cx="${x}" cy="${y}" r="${15 * unit}"/><rect class="vehicle-shape" x="${x - 8 * unit}" y="${y - 6 * unit}" width="${16 * unit}" height="${12 * unit}" rx="${3 * unit}"/>${label(r.id, x - 10 * unit, y + 22 * unit)}</g>`;
      })
      .join(""),
  );
  const hasGeometry =
    map.points.some(validXY) ||
    map.stations.some(validXY) ||
    robots.some(validXY);
  $("mapEmpty").hidden = hasGeometry;
  $("warehouseMap").querySelector(".map-controls").hidden = !hasGeometry;
  $("warehouseMap").querySelector(".map-compass").hidden = !hasGeometry;
  $("mapEmptyTitle").textContent =
    modelError && !model
      ? "Plant model unavailable"
      : model
        ? "No plant model loaded"
        : "Connecting to your workspace";
  $("mapEmptyDescription").textContent =
    modelError && !model
      ? "The model could not be retrieved. Check the connection and refresh."
      : model
        ? connected()
          ? "The server is connected. Load a measured plant model to see your routes, stations and vehicles here."
          : "The plant model is empty. Waiting for current fleet feedback."
        : "Waiting for the live plant model.";
  $("modelName").textContent = model
    ? (model.name && model.name !== "unnamed" ? model.name : "Empty model") +
      (modelFresh ? "" : " · stale")
    : "Waiting for model";
  for (const [id, items] of [
    ["pointCount", map.points],
    ["pathCount", map.paths],
    ["stationCount", map.stations],
  ])
    $(id).textContent = model ? items.length : "—";
  $("setupServer").classList.toggle("complete", connected());
  $("setupModel").classList.toggle(
    "complete",
    map.points.length > 0 && modelFresh,
  );
  $("setupVehicles").classList.toggle(
    "complete",
    robots.length > 0 && connected(),
  );
}
function render() {
  renderFleet();
  renderInspector();
  renderControls();
  renderMap();
}
const api = new FleetAPI(
  (state) => {
    const first = !stateReceived;
    stateReceived = true;
    robots = state.robots || [];
    orders = state.orders || [];
    upstreamOnline = Boolean(state.upstreamOnline);
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
);
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
    modelError = "";
    if (changed) fitMap();
    if (report) {
      log("Plant model refreshed.");
      notify("Plant model refreshed.");
    }
  } catch (error) {
    modelFresh = false;
    if (modelError !== error.message)
      log("Plant model unavailable. " + error.message, true);
    modelError = error.message;
    if (report) notify("Unable to refresh the plant model.", true);
  } finally {
    loadingModel = false;
    $("refreshModel").disabled = false;
    render();
  }
}
function setView(view) {
  const copy = {
    overview: [
      "Overview",
      "Your fleet, routes and transport orders in one workspace.",
    ],
    vehicles: [
      "Vehicles",
      "Inspect availability, reported positions and current tasks.",
    ],
    orders: [
      "Transport orders",
      "Track the live order pool and processing state.",
    ],
    activity: [
      "Activity",
      "Connection changes and operation receipts from this session.",
    ],
  };
  $("workspace").dataset.view = view;
  $("headerView").textContent = $("viewTitle").textContent = copy[view][0];
  $("viewDescription").textContent = copy[view][1];
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (view === "orders" || view === "activity") setDataTab(view);
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
  setInspectorTab("details");
  render();
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
  } catch (error) {
    log(error.message, true);
    notify(error.message, true);
  } finally {
    busy = false;
    renderControls();
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
for (const button of document.querySelectorAll(".nav-item"))
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
$("accessForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const previous = api.key;
  api.key = $("controlKey").value.trim();
  $("saveAccess").disabled = true;
  try {
    await api.verifyKey();
    $("accessDialog").close();
    log("Operator control session enabled for this tab.");
    notify("Control session enabled.");
  } catch (error) {
    api.key = previous;
    $("accessError").textContent = error.message;
    $("accessError").hidden = false;
  } finally {
    $("saveAccess").disabled = false;
    renderControls();
  }
});
$("clearAccess").addEventListener("click", () => {
  api.key = "";
  $("accessDialog").close();
  renderControls();
  log("Control session ended. Read-only access remains.");
});
$("newOrderButton").addEventListener("click", () => {
  if (
    $("workspace").dataset.view === "orders" ||
    $("workspace").dataset.view === "activity"
  )
    setView("overview");
  setInspectorTab("dispatch");
  if (!api.key) openAccess();
});
$("navigateForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("sendOrderButton").disabled) return;
  action(async () => {
    const content = { to: $("toPoint").value, robotId: selectedRobotId };
    if (
      pendingSubmission &&
      JSON.stringify(pendingSubmission.content) !== JSON.stringify(content)
    )
      throw new Error(
        `Resolve pending request ${pendingSubmission.requestId} before changing the vehicle or destination.`,
      );
    if (!pendingSubmission)
      pendingSubmission = { content, requestId: api.id() };
    let result;
    try {
      result = await api.order({
        ...content,
        requestId: pendingSubmission.requestId,
      });
    } catch (error) {
      if (error.definitive) pendingSubmission = null;
      throw error;
    }
    pendingSubmission = null;
    log(`Order ${result.id} accepted. Awaiting vehicle execution feedback.`);
    notify("Order accepted. Awaiting vehicle feedback.");
  });
});
for (const [id, operation] of [
  ["estopButton", "pause"],
  ["resumeButton", "resume"],
])
  $(id).addEventListener("click", () =>
    action(async () => {
      const result = await api.fleet(operation);
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
    const robot = currentRobot();
    if (!robot?.task) throw new Error("No reported order to withdraw.");
    await api.cancel(robot.task);
    log("Withdrawal requested. Awaiting vehicle confirmation.");
    notify("Withdrawal requested. Awaiting vehicle feedback.");
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
    setView("overview");
    fitMap();
    const group = model?.[button.dataset.mapFocus] || [];
    $("mapFocusHint").textContent = group.length
      ? `${group.length} ${button.dataset.mapFocus} in the loaded model`
      : `No ${button.dataset.mapFocus} in the loaded model`;
    $("mapFocusHint").hidden = false;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => ($("mapFocusHint").hidden = true), 3500);
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
        ? "Feedback stale"
        : "Waiting for live state";
}
window.addEventListener("resize", renderMap);
render();
clock();
setInterval(clock, 1000);
let bootError = "";
async function boot() {
  try {
    layout = await api.start();
    render();
    await loadModel();
    setInterval(() => loadModel(), 30000);
  } catch (error) {
    if (bootError !== error.message) {
      log("Unable to load the fleet. " + error.message, true);
      bootError = error.message;
    }
    setTimeout(boot, 4000);
  }
}
boot();
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker
    .register("sw.js")
    .catch((error) =>
      console.warn("Offline support unavailable:", error.message),
    );
