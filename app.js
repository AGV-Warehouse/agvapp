const points = [
  { id: "A", name: "Receiving A", x: 14, y: 24 },
  { id: "B", name: "Storage B", x: 42, y: 28 },
  { id: "C", name: "Storage C", x: 58, y: 62 },
  { id: "D", name: "Packing D", x: 82, y: 30 },
  { id: "E", name: "Dock A", x: 14, y: 84 },
  { id: "F", name: "Dock B", x: 86, y: 84 },
  { id: "G", name: "Charge", x: 49, y: 84 },
];

const robots = Array.from({ length: 10 }, (_, index) => {
  const point = points[index % points.length];
  return {
    id: `AGV-${String(index + 1).padStart(2, "0")}`,
    name: `AGV-${String(index + 1).padStart(2, "0")}`,
    status: index === 6 ? "alert" : index % 3 === 0 ? "moving" : "idle",
    battery: Math.max(24, 94 - index * 6),
    x: Math.min(92, point.x + (index % 2 === 0 ? 3 : -3)),
    y: Math.min(90, point.y + (index % 2 === 0 ? 2 : -2)),
    task: index % 3 === 0 ? "Route check" : "Waiting",
    velocity: index % 3 === 0 ? 0.6 : 0,
    location: point.name,
  };
});

let selectedRobotId = robots[0].id;
let fleetStopped = false;

const els = {
  alertsCount: document.querySelector("#alertsCount"),
  armSendGoal: document.querySelector("#armSendGoal"),
  armSetPose: document.querySelector("#armSetPose"),
  batteryValue: document.querySelector("#batteryValue"),
  cancelGoalButton: document.querySelector("#cancelGoalButton"),
  commsLog: document.querySelector("#commsLog"),
  detectionControls: document.querySelector("#detectionControls"),
  detectionReset: document.querySelector("#detectionReset"),
  detectionSummary: document.querySelector("#detectionSummary"),
  connectionPill: document.querySelector("#connectionPill"),
  estopButton: document.querySelector("#estopButton"),
  estopReal: document.querySelector("#estopReal"),
  jogPad: document.querySelector("#jogPad"),
  mapActionHint: document.querySelector("#mapActionHint"),
  fleetMode: document.querySelector("#fleetMode"),
  fromPoint: document.querySelector("#fromPoint"),
  headingValue: document.querySelector("#headingValue"),
  locationValue: document.querySelector("#locationValue"),
  logPanelMode: document.querySelector("#logPanelMode"),
  mapCanvas: document.querySelector("#mapCanvas"),
  mapPoints: document.querySelector("#mapPoints"),
  movingCount: document.querySelector("#movingCount"),
  navigateForm: document.querySelector("#navigateForm"),
  onlineCount: document.querySelector("#onlineCount"),
  resumeButton: document.querySelector("#resumeButton"),
  robotList: document.querySelector("#robotList"),
  robotMarkers: document.querySelector("#robotMarkers"),
  robotState: document.querySelector("#robotState"),
  rosUrlLabel: document.querySelector("#rosUrlLabel"),
  selectedRobotName: document.querySelector("#selectedRobotName"),
  taskValue: document.querySelector("#taskValue"),
  toPoint: document.querySelector("#toPoint"),
  velocityValue: document.querySelector("#velocityValue"),
};

function selectedRobot() {
  return robots.find((robot) => robot.id === selectedRobotId);
}

function statusLabel(status) {
  if (status === "alert") return "Alert";
  if (status === "moving") return "Moving";
  return "Idle";
}

function renderPointOptions() {
  const options = points
    .map((point) => `<option value="${point.id}">${point.name}</option>`)
    .join("");
  els.fromPoint.innerHTML = options;
  els.toPoint.innerHTML = options;
  els.toPoint.value = "D";
}

function renderMapPoints() {
  els.mapPoints.innerHTML = points
    .map(
      (point) =>
        `<div class="map-point" style="left:${point.x}%;top:${point.y}%" title="${point.name}">${point.id}</div>`,
    )
    .join("");
}

function renderRobotList() {
  els.robotList.innerHTML = robots
    .map(
      (robot) => `
        <button class="robot-row ${robot.id === selectedRobotId ? "active" : ""}" data-robot-id="${robot.id}" type="button">
          <span>
            <strong>${robot.name}</strong>
            <small>${robot.location} &middot; ${robot.battery}%</small>
          </span>
          <span class="status-badge status-${robot.status}">${statusLabel(robot.status)}</span>
        </button>
      `,
    )
    .join("");
}

function renderRobotMarkers() {
  els.robotMarkers.innerHTML = robots
    .map(
      (robot) => `
        <button
          class="robot-marker ${robot.id === selectedRobotId ? "selected" : ""} ${robot.status === "alert" ? "alert" : ""}"
          style="left:${robot.x}%;top:${robot.y}%"
          data-robot-id="${robot.id}"
          type="button"
          title="${robot.name}: ${statusLabel(robot.status)}"
        >
          ${robot.id.slice(-2)}
        </button>
      `,
    )
    .join("");
}

function renderStatus() {
  const robot = selectedRobot();
  els.selectedRobotName.textContent = robot.name;
  els.robotState.textContent = statusLabel(robot.status);
  els.robotState.className = `status-badge status-${robot.status}`;
  els.batteryValue.textContent = `${robot.battery}%`;
  els.locationValue.textContent = robot.location;
  els.taskValue.textContent = robot.task;
  els.velocityValue.textContent = `${robot.velocity.toFixed(1)} m/s`;
}

function renderSummary() {
  els.onlineCount.textContent = robots.filter((robot) => robot.status !== "alert").length;
  els.movingCount.textContent = robots.filter((robot) => robot.status === "moving").length;
  els.alertsCount.textContent = robots.filter((robot) => robot.status === "alert").length;
  els.fleetMode.textContent = fleetStopped ? "Stopped" : "Mock ROS";
  els.connectionPill.innerHTML = `<span></span>${fleetStopped ? "Commands paused" : "ROS bridge standby"}`;
}

function render() {
  renderSummary();
  renderRobotList();
  renderRobotMarkers();
  renderStatus();
}

function logMessage(message) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const item = document.createElement("li");
  item.textContent = `[${time}] ${message}`;
  els.commsLog.prepend(item);
  while (els.commsLog.children.length > 8) {
    els.commsLog.lastElementChild.remove();
  }
}

function moveRobotToPoint(robot, point, taskName) {
  robot.status = "moving";
  robot.task = taskName;
  robot.velocity = 0.7;
  render();

  window.setTimeout(() => {
    if (fleetStopped) return;
    robot.x = point.x;
    robot.y = point.y;
    robot.location = point.name;
    robot.status = "idle";
    robot.task = "Waiting";
    robot.velocity = 0;
    robot.battery = Math.max(8, robot.battery - 1);
    logMessage(`${robot.id} reached ${point.name}`);
    render();
  }, 900);
}

function sendNavigateCommand(fromId, toId) {
  const robot = selectedRobot();
  const from = points.find((point) => point.id === fromId);
  const to = points.find((point) => point.id === toId);

  if (fleetStopped) {
    logMessage(`Rejected /navigate for ${robot.id}: fleet is stopped`);
    return;
  }

  if (robot.status === "alert") {
    logMessage(`Rejected /navigate for ${robot.id}: alert state active`);
    return;
  }

  robot.location = from.name;
  robot.x = from.x;
  robot.y = from.y;
  logMessage(`POST /ros/${robot.id}/navigate from=${from.id} to=${to.id}`);
  moveRobotToPoint(robot, to, `Navigating ${from.id} -> ${to.id}`);
}

function sendManualCommand(command) {
  const robot = selectedRobot();
  const deltas = {
    forward: [0, -5],
    backward: [0, 5],
    left: [-5, 0],
    right: [5, 0],
    stop: [0, 0],
  };

  if (fleetStopped && command !== "stop") {
    logMessage(`Rejected /cmd_vel ${command} for ${robot.id}: fleet is stopped`);
    return;
  }

  const [dx, dy] = deltas[command];
  robot.x = Math.max(4, Math.min(96, robot.x + dx));
  robot.y = Math.max(6, Math.min(94, robot.y + dy));
  robot.status = command === "stop" ? "idle" : "moving";
  robot.velocity = command === "stop" ? 0 : 0.4;
  robot.task = command === "stop" ? "Manual stop" : `Manual ${command}`;
  logMessage(`POST /ros/${robot.id}/cmd_vel command=${command}`);
  render();
}

function stopFleet() {
  fleetStopped = true;
  robots.forEach((robot) => {
    if (robot.status !== "alert") {
      robot.status = "idle";
      robot.velocity = 0;
      robot.task = "Emergency stopped";
    }
  });
  logMessage("POST /ros/fleet/e_stop");
  render();
}

function resumeFleet() {
  fleetStopped = false;
  robots.forEach((robot) => {
    if (robot.status !== "alert" && robot.task === "Emergency stopped") {
      robot.task = "Waiting";
    }
  });
  logMessage("POST /ros/fleet/resume");
  render();
}

function bindEvents() {
  els.robotList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-robot-id]");
    if (!row) return;
    selectedRobotId = row.dataset.robotId;
    render();
  });

  els.robotMarkers.addEventListener("click", (event) => {
    const marker = event.target.closest("[data-robot-id]");
    if (!marker) return;
    selectedRobotId = marker.dataset.robotId;
    render();
  });

  els.navigateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendNavigateCommand(els.fromPoint.value, els.toPoint.value);
  });

  document.querySelector(".manual-pad").addEventListener("click", (event) => {
    const button = event.target.closest("[data-command]");
    if (!button) return;
    sendManualCommand(button.dataset.command);
  });

  els.estopButton.addEventListener("click", stopFleet);
  els.resumeButton.addEventListener("click", resumeFleet);
}

function tickMockTelemetry() {
  if (!fleetStopped) {
    robots.forEach((robot) => {
      if (robot.status === "moving") {
        robot.battery = Math.max(8, robot.battery - 0.1);
      }
    });
    renderSummary();
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {
      logMessage("Service worker registration skipped");
    });
  }
}

// --- Bridge swap seam (Phase 0) -------------------------------------------
// Startup selection:
//   (no ?ros param)      -> the legacy 10-robot mock fleet demo above, untouched
//   ?ros=mock            -> live-robot UI driven by MockBridge, for offline dev
//                           of the map/pose/command path with no robot present
//   ?ros=ws://host:9090  -> the real robot, via rosbridge
// See bridge.js for both implementations of the shared Bridge interface.

function updateConnectionUI(connected) {
  els.connectionPill.classList.toggle("disconnected", !connected);
  els.connectionPill.innerHTML = `<span></span>${connected ? "Connected to rosbridge" : "Disconnected"}`;
  els.robotState.textContent = connected ? "Connected" : "Disconnected";
  els.robotState.className = `status-badge ${connected ? "status-idle" : "status-alert"}`;
  logMessage(connected ? "rosbridge connected" : "rosbridge disconnected");
}

// Deliberately small starting speeds -- raise only after the jog and watchdog
// tests pass on the real robot.
const JOG_LINEAR = 0.1; // m/s
const JOG_ANGULAR = 0.3; // rad/s
const JOG_VECTORS = {
  forward: [JOG_LINEAR, 0],
  backward: [-JOG_LINEAR, 0],
  left: [0, JOG_ANGULAR], // +wz is counter-clockwise
  right: [0, -JOG_ANGULAR],
};
// Below this drag distance (meters, world scale) treat the gesture as a plain
// tap and keep the robot's current yaw. A finger tap wobbles several screen
// pixels; a threshold that small turns tap wobble into an arbitrary heading,
// and a wrong heading makes AMCL scan-matching walk the estimate right off
// the map. Aiming must be a deliberate drag.
const HEADING_DRAG_MIN_M = 0.15;

function initRealMode(bridge, sourceLabel) {
  const ctx = els.mapCanvas.getContext("2d");
  let mapInfo = null;
  let baseImageData = null;
  let latestPose = null;
  let plannedPath = []; // [{x, y}] world coords, latest /plan
  let boxRects = null; // flat world rects of the detected objects, see publishBoxes()
  let connected = false;
  let armed = null; // "pose" | "goal" | null
  let drag = null; // { from:{x,y}, to:{x,y} } in world coords

  function redraw() {
    if (!mapInfo || !baseImageData) return;
    ctx.putImageData(baseImageData, 0, 0);
    drawPath(ctx, mapInfo, pathAhead(plannedPath, latestPose));
    if (drag) {
      const yaw = dragYaw(drag);
      drawPoseMarker(ctx, mapInfo, { ...drag.from, yaw }, {
        color: armed === "pose" ? "#b7791f" : "#2563eb",
        radiusMeters: 0.18,
      });
    }
    // Grey the marker while disconnected so a frozen pose can't read as live.
    if (latestPose) {
      drawPoseMarker(ctx, mapInfo, latestPose, connected ? undefined : { color: "#94a3b8" });
    }
  }

  function dragYaw(current) {
    const dx = current.to.x - current.from.x;
    const dy = current.to.y - current.from.y;
    if (Math.hypot(dx, dy) < HEADING_DRAG_MIN_M) return latestPose ? latestPose.yaw : 0;
    return Math.atan2(dy, dx);
  }

  function setArmed(mode) {
    armed = mode;
    els.armSetPose.classList.toggle("active", mode === "pose");
    els.armSendGoal.classList.toggle("active", mode === "goal");
    els.mapCanvas.classList.toggle("armed", Boolean(mode));
    els.mapActionHint.textContent = mode
      ? `Tap the map to place, drag to aim, release to ${mode === "pose" ? "set pose" : "send goal"}.`
      : "Pick an action, then tap the map and drag to aim.";
  }

  function setControlsEnabled(enabled) {
    [els.armSetPose, els.armSendGoal, els.cancelGoalButton, els.estopReal].forEach((el) => {
      el.disabled = !enabled;
    });
    els.jogPad.querySelectorAll("button").forEach((button) => {
      button.disabled = !enabled;
    });
    if (!enabled) setArmed(null);
  }

  // --- telemetry (Phase 1) ------------------------------------------------
  bridge.onConnectionChange((isConnected) => {
    connected = isConnected;
    updateConnectionUI(isConnected);
    if (!isConnected) bridge.stopJog(); // clear the hold; nothing can be sent anyway
    setControlsEnabled(isConnected);
    redraw();
  });

  bridge.onPath((path) => {
    plannedPath = path;
    redraw();
  });

  // The boxes drawn on the map are also what the robot plans around: the
  // robot stamps them into its global costmap's map (object_boxes.py in
  // linorobot2_navigation). Sent when /map arrives (always after the socket
  // opens) and whenever the detection result changes.
  function publishBoxes() {
    if (!connected || !boxRects) return;
    bridge.publishBoxes(boxRects);
    logMessage(`/object_boxes -> ${boxRects.length / 4} boxes for the planner to avoid`);
  }

  bridge.onMap((mapMsg) => {
    mapMsgCache = mapMsg;
    const result = paintMap();
    publishBoxes();
    // Resolution arrives as a float32-widened double (0.02500000037252903),
    // so trim it before display.
    const res = +mapInfo.resolution.toFixed(4);
    logMessage(
      `Received /map (${mapInfo.width}x${mapInfo.height} @ ${res}m): ${result.walls} walls, ${result.boxes.length} objects`,
    );
  });

  // --- walls vs objects (see classifyMap in map.js) -----------------------
  // The sliders re-run the detection on the cached /map in the browser. The
  // resulting boxes go to the robot when a slider is released (not while it
  // is dragged: each send makes the Jetson rebuild its global costmap).
  // Settings are remembered per browser.
  const DETECTION_STORAGE_KEY = "agv.mapDetection";
  const DETECTION_SLIDERS = [
    { key: "wallGap", label: "Join wall gaps up to", min: 0, max: 0.4, step: 0.025, unit: " m" },
    { key: "wallMinLength", label: "Wall if longer than", min: 0.3, max: 4, step: 0.1, unit: " m" },
    { key: "objectLink", label: "Group object dots within", min: 0, max: 1.2, step: 0.05, unit: " m" },
    { key: "objectMaxSize", label: "Largest object", min: 0.3, max: 3, step: 0.1, unit: " m" },
    { key: "objectMinDots", label: "Dots needed for a box", min: 1, max: 8, step: 1, unit: "" },
  ];
  let mapMsgCache = null;
  let repaintQueued = false;
  let detection = loadDetection();

  function loadDetection() {
    const settings = { ...MAP_DETECTION_DEFAULTS };
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(DETECTION_STORAGE_KEY)) || {};
    } catch (error) {
      stored = {};
    }
    // Stored values are untrusted: keep only finite numbers, clamped to range.
    DETECTION_SLIDERS.forEach(({ key, min, max }) => {
      const value = Number(stored[key]);
      if (Number.isFinite(value)) settings[key] = Math.min(max, Math.max(min, value));
    });
    return settings;
  }

  function saveDetection() {
    try {
      localStorage.setItem(DETECTION_STORAGE_KEY, JSON.stringify(detection));
    } catch (error) {
      // private window / storage blocked: settings just won't persist
    }
  }

  function paintMap() {
    const result = classifyMap(mapMsgCache, detection);
    mapInfo = renderOccupancyGrid(els.mapCanvas, mapMsgCache, result.cellClass);
    drawObjectBoxes(ctx, mapInfo, result.boxes);
    boxRects = boxesToWorldRects(mapInfo, result.boxes);
    // Cache the painted map so pose updates can restore it without re-walking
    // the whole occupancy array on every frame.
    baseImageData = ctx.getImageData(0, 0, els.mapCanvas.width, els.mapCanvas.height);
    els.detectionSummary.textContent = `${result.walls} walls · ${result.boxes.length} objects`;
    redraw();
    return result;
  }

  function syncDetectionControls() {
    DETECTION_SLIDERS.forEach(({ key, unit }) => {
      els.detectionControls.querySelector(`[data-key="${key}"]`).value = detection[key];
      els.detectionControls.querySelector(`[data-out="${key}"]`).textContent = `${+detection[key].toFixed(3)}${unit}`;
    });
  }

  els.detectionControls.innerHTML = DETECTION_SLIDERS.map(
    ({ key, label, min, max, step }) => `
      <label class="detect-row">
        <span>${label} <b data-out="${key}"></b></span>
        <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" />
      </label>`,
  ).join("");
  syncDetectionControls();

  els.detectionControls.addEventListener("input", (event) => {
    const key = event.target.dataset.key;
    if (!key) return;
    detection[key] = Number(event.target.value);
    syncDetectionControls();
    saveDetection();
    if (mapMsgCache && !repaintQueued) {
      repaintQueued = true;
      requestAnimationFrame(() => {
        repaintQueued = false;
        paintMap();
      });
    }
  });

  // "change" fires once, when the slider is released.
  els.detectionControls.addEventListener("change", () => {
    if (!mapMsgCache) return;
    paintMap();
    publishBoxes();
  });

  els.detectionReset.addEventListener("click", () => {
    detection = { ...MAP_DETECTION_DEFAULTS };
    saveDetection();
    syncDetectionControls();
    if (!mapMsgCache) return;
    paintMap();
    publishBoxes();
  });

  bridge.onPose((pose) => {
    latestPose = pose;
    els.locationValue.textContent = `${pose.x.toFixed(2)}, ${pose.y.toFixed(2)} m`;
    els.headingValue.textContent = `${((pose.yaw * 180) / Math.PI).toFixed(0)}°`;
    redraw();
  });

  // --- map actions: tap to place, drag to aim (Phase 2) -------------------
  // Set-pose and send-goal are the same gesture on different topics.
  els.armSetPose.addEventListener("click", () => setArmed(armed === "pose" ? null : "pose"));
  els.armSendGoal.addEventListener("click", () => setArmed(armed === "goal" ? null : "goal"));

  function worldAt(event) {
    const point = canvasPointToPixel(els.mapCanvas, event.clientX, event.clientY);
    if (!isInsideGrid(mapInfo, point)) return null;
    return pixelToWorld(mapInfo, point.px, point.py);
  }

  els.mapCanvas.addEventListener("pointerdown", (event) => {
    if (!armed || !mapInfo || !connected) return;
    const world = worldAt(event);
    if (!world) return;
    drag = { from: world, to: world };
    els.mapCanvas.setPointerCapture(event.pointerId);
    redraw();
  });

  els.mapCanvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const point = canvasPointToPixel(els.mapCanvas, event.clientX, event.clientY);
    drag.to = pixelToWorld(mapInfo, point.px, point.py); // heading may aim off-grid
    redraw();
  });

  function finishDrag(event) {
    if (!drag) return;
    const target = drag.from;
    const yaw = dragYaw(drag);
    const mode = armed;
    drag = null;
    if (els.mapCanvas.hasPointerCapture(event.pointerId)) {
      els.mapCanvas.releasePointerCapture(event.pointerId);
    }
    // One-shot: disarm after publishing so a stray later tap can't move the robot.
    setArmed(null);
    const degrees = ((yaw * 180) / Math.PI).toFixed(0);
    if (mode === "pose") {
      // Relocalizing invalidates any in-flight plan -- if a goal is still
      // executing, the controller would immediately drive from the "new"
      // position on a stale path. Cancel first, always.
      bridge.cancel();
      plannedPath = [];
      bridge.setPose(target.x, target.y, yaw);
      logMessage(`/initialpose -> ${target.x.toFixed(2)}, ${target.y.toFixed(2)} @ ${degrees}° (goals canceled)`);
    } else if (mode === "goal") {
      bridge.sendGoal(target.x, target.y, yaw);
      logMessage(`/goal_pose -> ${target.x.toFixed(2)}, ${target.y.toFixed(2)} @ ${degrees}°`);
    }
    redraw();
  }

  els.mapCanvas.addEventListener("pointerup", finishDrag);
  els.mapCanvas.addEventListener("pointercancel", (event) => {
    drag = null;
    if (els.mapCanvas.hasPointerCapture(event.pointerId)) {
      els.mapCanvas.releasePointerCapture(event.pointerId);
    }
    redraw();
  });

  els.cancelGoalButton.addEventListener("click", () => {
    plannedPath = [];
    redraw();
    bridge.cancel((result, error) => {
      if (error) logMessage(`cancel_goal FAILED: ${error}`);
      else logMessage(`cancel_goal ok (canceling ${(result.goals_canceling || []).length})`);
    });
  });

  // --- manual jog: dead-man switch (Phase 3) ------------------------------
  // Every path that could end a press must stop the robot: release, finger
  // sliding off the button, pointer cancelled by the OS, tab hidden, window
  // blurred, page unloaded. The firmware's 200ms watchdog is the last resort,
  // not the plan.
  let holding = null;

  function startJog(button) {
    const vector = JOG_VECTORS[button.dataset.jog];
    if (!vector || !connected) return;
    holding = button;
    button.classList.add("holding");
    bridge.jog(vector[0], vector[1]);
    logMessage(`/cmd_vel hold ${button.dataset.jog} (${vector[0]} m/s, ${vector[1]} rad/s)`);
  }

  function endJog(reason) {
    bridge.stopJog();
    if (holding) {
      holding.classList.remove("holding");
      holding = null;
      logMessage(`/cmd_vel stop${reason ? ` (${reason})` : ""}`);
    }
  }

  els.jogPad.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-jog]");
    if (!button || button.disabled) return;
    event.preventDefault(); // don't let the tablet start a scroll/selection
    if (button.dataset.jog === "stop") {
      endJog("stop button");
      return;
    }
    startJog(button);
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach((type) => {
    els.jogPad.addEventListener(type, () => endJog(type === "pointerleave" ? "slid off button" : null));
  });

  window.addEventListener("blur", () => endJog("window blur"));
  window.addEventListener("pagehide", () => endJog("page hide"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) endJog("tab hidden");
  });

  els.estopReal.addEventListener("click", () => {
    bridge.stopJog();
    bridge.cancel();
    plannedPath = [];
    redraw();
    logMessage("E-STOP: zero /cmd_vel + cancel all goals");
  });

  setControlsEnabled(false); // stay locked until the socket actually opens
  els.selectedRobotName.textContent = "AGV (live)";
  els.logPanelMode.textContent = "Live rosbridge";
  els.rosUrlLabel.textContent = sourceLabel;
  logMessage(`Bridge source: ${sourceLabel}`);
}

const rosParam = new URLSearchParams(window.location.search).get("ros");
const realMode = Boolean(rosParam);
document.body.classList.toggle("mode-real", realMode);

if (realMode) {
  const offline = rosParam === "mock";
  initRealMode(offline ? createMockBridge() : createRosBridge(rosParam), offline ? "mock bridge (offline)" : rosParam);
} else {
  renderPointOptions();
  renderMapPoints();
  bindEvents();
  render();
  logMessage("Mock ROS bridge initialized for 10 robots");
  window.setInterval(tickMockTelemetry, 4000);
}

registerServiceWorker();
