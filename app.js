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
  batteryValue: document.querySelector("#batteryValue"),
  commsLog: document.querySelector("#commsLog"),
  connectionPill: document.querySelector("#connectionPill"),
  estopButton: document.querySelector("#estopButton"),
  fleetMode: document.querySelector("#fleetMode"),
  fromPoint: document.querySelector("#fromPoint"),
  locationValue: document.querySelector("#locationValue"),
  mapPoints: document.querySelector("#mapPoints"),
  movingCount: document.querySelector("#movingCount"),
  navigateForm: document.querySelector("#navigateForm"),
  onlineCount: document.querySelector("#onlineCount"),
  resumeButton: document.querySelector("#resumeButton"),
  robotList: document.querySelector("#robotList"),
  robotMarkers: document.querySelector("#robotMarkers"),
  robotState: document.querySelector("#robotState"),
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

renderPointOptions();
renderMapPoints();
bindEvents();
render();
logMessage("Mock ROS bridge initialized for 10 robots");
registerServiceWorker();
window.setInterval(tickMockTelemetry, 4000);
