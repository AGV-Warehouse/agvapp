const points = [
  { id: "A", name: "Receiving A", x: 14, y: 24 },
  { id: "B", name: "Storage B", x: 42, y: 28 },
  { id: "C", name: "Storage C", x: 58, y: 62 },
  { id: "D", name: "Packing D", x: 82, y: 30 },
  { id: "E", name: "Dock A", x: 14, y: 84 },
  { id: "F", name: "Dock B", x: 86, y: 84 },
  { id: "G", name: "Charge", x: 49, y: 84 },
];

const robots = APP_CONFIG.robots.map((cfg, index) => {
  const point = points[index % points.length];
  if (cfg.type === "ros") {
    return {
      id: cfg.id,
      name: cfg.name,
      isReal: true,
      connected: false,
      stale: false,
      worldPose: null, // { x, y, yaw } in the map frame
      status: "offline",
      battery: null, // no battery topic on this robot
      x: point.x,
      y: point.y,
      task: "Waiting",
      velocity: 0,
      location: "—",
    };
  }
  return {
    id: cfg.id,
    name: cfg.name,
    isReal: false,
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
let mapTapMode = "select"; // select | goal | pose
let mapRenderer = null;
const connections = new Map(); // robot id -> RosRobotConnection

const els = {
  alertsCount: document.querySelector("#alertsCount"),
  batteryValue: document.querySelector("#batteryValue"),
  commsLog: document.querySelector("#commsLog"),
  connectionPill: document.querySelector("#connectionPill"),
  estopButton: document.querySelector("#estopButton"),
  fleetMode: document.querySelector("#fleetMode"),
  fromPoint: document.querySelector("#fromPoint"),
  locationValue: document.querySelector("#locationValue"),
  mapCanvas: document.querySelector("#mapCanvas"),
  mapPoints: document.querySelector("#mapPoints"),
  mapSourceLabel: document.querySelector("#mapSourceLabel"),
  mapTapMode: document.querySelector("#mapTapMode"),
  movingCount: document.querySelector("#movingCount"),
  navigateForm: document.querySelector("#navigateForm"),
  onlineCount: document.querySelector("#onlineCount"),
  resumeButton: document.querySelector("#resumeButton"),
  robotList: document.querySelector("#robotList"),
  robotMarkers: document.querySelector("#robotMarkers"),
  robotState: document.querySelector("#robotState"),
  rosTopicValue: document.querySelector("#rosTopicValue"),
  selectedRobotName: document.querySelector("#selectedRobotName"),
  taskValue: document.querySelector("#taskValue"),
  toPoint: document.querySelector("#toPoint"),
  velocityValue: document.querySelector("#velocityValue"),
  warehouseMap: document.querySelector("#warehouseMap"),
};

function selectedRobot() {
  return robots.find((robot) => robot.id === selectedRobotId);
}

function robotConfig(robotId) {
  return APP_CONFIG.robots.find((cfg) => cfg.id === robotId);
}

function statusLabel(status) {
  if (status === "alert") return "Alert";
  if (status === "moving") return "Moving";
  if (status === "offline") return "Offline";
  if (status === "stale") return "Stale";
  return "Idle";
}

function realRobotStatus(robot) {
  if (!robot.connected) return "offline";
  if (robot.stale) return "stale";
  return Math.abs(robot.velocity) > 0.01 ? "moving" : "idle";
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
            <strong>${robot.name}</strong>${robot.isReal ? "" : '<span class="sim-tag">SIM</span>'}
            <small>${robot.location} &middot; ${robot.battery === null ? "n/a" : `${Math.round(robot.battery)}%`}</small>
          </span>
          <span class="status-badge status-${robot.status}">${statusLabel(robot.status)}</span>
        </button>
      `,
    )
    .join("");
}

function markerPosition(robot) {
  if (robot.isReal) {
    if (!robot.worldPose || !mapRenderer || !mapRenderer.hasMap()) return null;
    const pos = mapRenderer.worldToPercent(robot.worldPose.x, robot.worldPose.y);
    if (!pos) return null;
    return { left: pos.leftPct, top: pos.topPct };
  }
  return { left: robot.x, top: robot.y };
}

function renderRobotMarkers() {
  els.robotMarkers.innerHTML = robots
    .map((robot) => {
      const pos = markerPosition(robot);
      if (!pos) return "";
      const heading = robot.isReal && robot.worldPose
        ? `<span class="heading" style="--heading:${-robot.worldPose.yaw}rad"></span>`
        : "";
      return `
        <button
          class="robot-marker ${robot.id === selectedRobotId ? "selected" : ""} ${robot.status === "alert" ? "alert" : ""} ${robot.isReal ? "real" : "mock"}"
          style="left:${pos.left}%;top:${pos.top}%"
          data-robot-id="${robot.id}"
          type="button"
          title="${robot.name}: ${statusLabel(robot.status)}"
        >
          ${heading}${robot.id.slice(-2)}
        </button>
      `;
    })
    .join("");
}

function renderStatus() {
  const robot = selectedRobot();
  els.selectedRobotName.textContent = robot.name;
  els.robotState.textContent = statusLabel(robot.status);
  els.robotState.className = `status-badge status-${robot.status}`;
  els.batteryValue.textContent = robot.battery === null ? "n/a" : `${Math.round(robot.battery)}%`;
  els.locationValue.textContent = robot.location;
  els.taskValue.textContent = robot.task;
  els.velocityValue.textContent = `${robot.velocity.toFixed(2)} m/s`;
  els.rosTopicValue.textContent = robot.isReal
    ? robotConfig(robot.id).topics.cmdVel.name
    : "(mock)";

  const padDisabled = robot.isReal && !robot.connected;
  document.querySelectorAll(".manual-pad button").forEach((button) => {
    button.disabled = padDisabled && button.dataset.command !== "stop";
  });
}

function renderSummary() {
  els.onlineCount.textContent = robots.filter(
    (robot) => robot.status !== "alert" && robot.status !== "offline",
  ).length;
  els.movingCount.textContent = robots.filter((robot) => robot.status === "moving").length;
  els.alertsCount.textContent = robots.filter((robot) => robot.status === "alert").length;
  els.fleetMode.textContent = fleetStopped ? "Stopped" : "Live+Mock";

  const realRobots = robots.filter((robot) => robot.isReal);
  let pillClass = "";
  let pillText = "Mock only";
  if (realRobots.length > 0) {
    if (realRobots.some((robot) => robot.connected && !robot.stale)) {
      pillClass = "connected";
      pillText = `ROS connected · ${realRobots.filter((r) => r.connected).map((r) => r.id).join(", ")}`;
    } else if (realRobots.some((robot) => robot.connected && robot.stale)) {
      pillClass = "stale";
      pillText = "Stale telemetry";
    } else {
      pillClass = "disconnected";
      pillText = "ROS disconnected";
    }
  }
  els.connectionPill.className = `connection-pill ${pillClass}`;
  els.connectionPill.innerHTML = "<span></span>";
  els.connectionPill.append(fleetStopped ? "Commands paused" : pillText);
}

function render() {
  renderSummary();
  renderRobotList();
  renderRobotMarkers();
  renderStatus();
}

// Cheap re-render for high-rate pose updates: markers + status only, so the
// robot list (and any button mid-press) is not innerHTML-clobbered at 10 Hz.
function renderLive() {
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
    logMessage(`Rejected navigate for ${robot.id}: fleet is stopped`);
    return;
  }

  if (robot.isReal) {
    const goal = APP_CONFIG.namedGoals[toId];
    if (!goal) {
      logMessage(`Rejected navigate for ${robot.id}: point ${toId} not surveyed yet (see config.js namedGoals)`);
      return;
    }
    const conn = connections.get(robot.id);
    const yaw = robot.worldPose
      ? Math.atan2(goal.y - robot.worldPose.y, goal.x - robot.worldPose.x)
      : 0;
    if (conn && conn.sendGoal(goal.x, goal.y, yaw)) {
      robot.task = `Navigating to ${to.name}`;
      logMessage(`${robot.id} goal → ${to.name} (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}) m`);
      render();
    } else {
      logMessage(`Rejected navigate for ${robot.id}: not connected`);
    }
    return;
  }

  if (robot.status === "alert") {
    logMessage(`Rejected navigate for ${robot.id}: alert state active`);
    return;
  }

  robot.location = from.name;
  robot.x = from.x;
  robot.y = from.y;
  logMessage(`POST /ros/${robot.id}/navigate from=${from.id} to=${to.id}`);
  moveRobotToPoint(robot, to, `Navigating ${from.id} -> ${to.id}`);
}

const JOG_COMMANDS = {
  forward: { linear: 1, angular: 0 },
  backward: { linear: -1, angular: 0 },
  left: { linear: 0, angular: 1 },
  right: { linear: 0, angular: -1 },
};

function startRealJog(robot, command) {
  const conn = connections.get(robot.id);
  if (!conn) return;
  if (command === "stop") {
    conn.estop();
    robot.task = "Manual stop";
    logMessage(`${robot.id} manual stop (goal canceled, zero velocity)`);
    render();
    return;
  }
  if (fleetStopped) {
    logMessage(`Rejected /cmd_vel ${command} for ${robot.id}: fleet is stopped`);
    return;
  }
  const jog = JOG_COMMANDS[command];
  const limits = robotConfig(robot.id).limits;
  if (conn.startJog(jog.linear * limits.maxLinear, jog.angular * limits.maxAngular)) {
    robot.task = `Manual ${command}`;
    logMessage(`${robot.id} jog ${command} (hold to move)`);
    render();
  } else {
    logMessage(`Rejected /cmd_vel ${command} for ${robot.id}: not connected`);
  }
}

function stopRealJog(robot) {
  const conn = connections.get(robot.id);
  if (conn) conn.stopJog();
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
  connections.forEach((conn, robotId) => {
    conn.estop();
    logMessage(`${robotId} e-stop: nav goal canceled, zero velocity sent`);
  });
  robots.forEach((robot) => {
    if (robot.status !== "alert") {
      if (!robot.isReal) {
        robot.status = "idle";
        robot.velocity = 0;
      }
      robot.task = "Emergency stopped";
    }
  });
  logMessage("Fleet e-stop engaged");
  render();
}

function resumeFleet() {
  fleetStopped = false;
  robots.forEach((robot) => {
    if (robot.status !== "alert" && robot.task === "Emergency stopped") {
      robot.task = "Waiting";
    }
  });
  // Never re-sends motion: commands must be issued fresh after a resume.
  logMessage("Fleet resumed (no motion re-sent)");
  render();
}

const TAP_MODES = [
  { id: "select", label: "Tap: Select" },
  { id: "goal", label: "Tap: Send goal" },
  { id: "pose", label: "Tap: Set pose" },
];

function cycleTapMode() {
  const index = TAP_MODES.findIndex((mode) => mode.id === mapTapMode);
  const next = TAP_MODES[(index + 1) % TAP_MODES.length];
  mapTapMode = next.id;
  els.mapTapMode.textContent = next.label;
}

function handleMapTap(event) {
  const marker = event.target.closest("[data-robot-id]");
  if (marker) {
    selectedRobotId = marker.dataset.robotId;
    render();
    return;
  }
  if (mapTapMode === "select") return;

  const robot = selectedRobot();
  if (!robot.isReal) {
    logMessage(`Map ${mapTapMode} tap ignored: ${robot.id} is a mock robot`);
    return;
  }
  if (!mapRenderer.hasMap()) {
    logMessage("Map tap ignored: no live map yet");
    return;
  }
  const world = mapRenderer.screenToWorld(event.clientX, event.clientY);
  if (!world) return;
  const conn = connections.get(robot.id);
  if (!conn || !conn.connected) {
    logMessage(`Rejected map ${mapTapMode} for ${robot.id}: not connected`);
    return;
  }

  if (mapTapMode === "goal") {
    if (fleetStopped) {
      logMessage(`Rejected goal for ${robot.id}: fleet is stopped`);
      return;
    }
    const yaw = robot.worldPose
      ? Math.atan2(world.y - robot.worldPose.y, world.x - robot.worldPose.x)
      : 0;
    conn.sendGoal(world.x, world.y, yaw);
    robot.task = `Navigating to (${world.x.toFixed(2)}, ${world.y.toFixed(2)})`;
    logMessage(`${robot.id} goal → (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) m`);
    render();
  } else if (mapTapMode === "pose") {
    conn.setInitialPose(world.x, world.y, robot.worldPose ? robot.worldPose.yaw : 0);
    logMessage(`${robot.id} initial pose set to (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) m`);
  }
}

function bindEvents() {
  els.robotList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-robot-id]");
    if (!row) return;
    selectedRobotId = row.dataset.robotId;
    render();
  });

  els.warehouseMap.addEventListener("click", handleMapTap);
  els.mapTapMode.addEventListener("click", cycleTapMode);

  els.navigateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendNavigateCommand(els.fromPoint.value, els.toPoint.value);
  });

  // Manual pad: mocks act on click; the real robot jogs while held
  // (pointerdown starts a 10 Hz /cmd_vel stream, release stops it).
  const manualPad = document.querySelector(".manual-pad");
  manualPad.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-command]");
    if (!button || button.disabled) return;
    const robot = selectedRobot();
    if (robot.isReal) {
      button.setPointerCapture(event.pointerId);
      startRealJog(robot, button.dataset.command);
    } else {
      sendManualCommand(button.dataset.command);
    }
  });
  const releaseJog = (event) => {
    const button = event.target.closest("[data-command]");
    if (!button) return;
    const robot = selectedRobot();
    if (robot.isReal && button.dataset.command !== "stop") {
      stopRealJog(robot);
    }
  };
  manualPad.addEventListener("pointerup", releaseJog);
  manualPad.addEventListener("pointercancel", releaseJog);

  els.estopButton.addEventListener("click", stopFleet);
  els.resumeButton.addEventListener("click", resumeFleet);
}

function tickMockTelemetry() {
  if (!fleetStopped) {
    robots.forEach((robot) => {
      if (!robot.isReal && robot.status === "moving") {
        robot.battery = Math.max(8, robot.battery - 0.1);
      }
    });
    renderSummary();
  }
}

function tickStaleness() {
  let changed = false;
  connections.forEach((conn, robotId) => {
    const robot = robots.find((r) => r.id === robotId);
    const stale = conn.isStale();
    if (robot.stale !== stale || robot.connected !== conn.connected) {
      robot.stale = stale;
      robot.connected = conn.connected;
      robot.status = realRobotStatus(robot);
      changed = true;
    }
  });
  if (changed) render();
}

function connectRealRobots() {
  const url = resolveRosbridgeUrl();
  APP_CONFIG.robots.filter((cfg) => cfg.type === "ros").forEach((cfg) => {
    const robot = robots.find((r) => r.id === cfg.id);
    const conn = new RosRobotConnection(cfg, url, {
      onState: () => {
        robot.connected = conn.connected;
        robot.status = realRobotStatus(robot);
        render();
      },
      onPose: (pose) => {
        robot.worldPose = {
          x: pose.position.x,
          y: pose.position.y,
          yaw: yawFromQuaternion(pose.orientation),
        };
        robot.location = `map (${pose.position.x.toFixed(2)}, ${pose.position.y.toFixed(2)})`;
        robot.status = realRobotStatus(robot);
        renderLive();
      },
      onOdom: (odom) => {
        robot.velocity = odom.twist.twist.linear.x;
        robot.status = realRobotStatus(robot);
        renderLive();
      },
      onMap: (grid) => {
        if (cfg.id !== APP_CONFIG.mapSourceRobotId) return;
        const firstMap = !mapRenderer.hasMap();
        mapRenderer.setGrid(grid);
        els.warehouseMap.classList.add("has-real-map");
        els.mapSourceLabel.textContent = `Live map · ${cfg.id}`;
        if (firstMap) {
          logMessage(`Live map received from ${cfg.id} (${grid.info.width}×${grid.info.height} @ ${grid.info.resolution} m)`);
        }
        renderRobotMarkers();
      },
      onNavEvent: (label) => {
        if (label === "arrived") robot.task = "Waiting";
        logMessage(`${cfg.id} navigation ${label}`);
        render();
      },
      onLog: logMessage,
    });
    connections.set(cfg.id, conn);
    conn.connect();
  });
  if (connections.size > 0) {
    logMessage(`Connecting to rosbridge at ${url} …`);
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {
      logMessage("Service worker registration skipped");
    });
  }
}

mapRenderer = new MapRenderer(els.mapCanvas, els.warehouseMap);
renderPointOptions();
renderMapPoints();
bindEvents();
render();
logMessage("AGV control initialized (1 real robot + 9 mocks)");
registerServiceWorker();
connectRealRobots();
window.setInterval(tickMockTelemetry, 4000);
window.setInterval(tickStaleness, 1000);
