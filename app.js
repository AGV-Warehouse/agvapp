/* Real fleet state only. Positions are metres, never UI-generated motion. */
let robots = [], points = [], layout = null, selectedRobotId = null;
let upstreamOnline = false, streamOnline = false, pendingSubmission = null;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function log(message) {
  const li = document.createElement("li");
  li.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
  $("commsLog").prepend(li);
  while ($("commsLog").children.length > 10) $("commsLog").lastElementChild.remove();
}
function position(x, y) {
  if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const b = layout.bounds, px = 100*(x-b.min_x)/(b.max_x-b.min_x), py = 100*(b.max_y-y)/(b.max_y-b.min_y);
  return px >= 0 && px <= 100 && py >= 0 && py <= 100 ? [px, py] : null;
}
function render() {
  const current = robots.find(r => r.id === selectedRobotId), connected = upstreamOnline && streamOnline;
  $("onlineCount").textContent = connected ? robots.filter(r => r.online && !r.stale).length : 0;
  $("movingCount").textContent = connected ? robots.filter(r => r.status === "EXECUTING").length : 0;
  $("alertsCount").textContent = robots.filter(r => !connected || !r.online || r.stale).length;
  $("fleetMode").textContent = connected ? "openTCS" : "Unavailable";
  $("connectionPill").textContent = connected ? "Fleet connected" : "State stale / disconnected";
  $("robotList").innerHTML = robots.map(r => '<button class="robot-row '+(r.id === selectedRobotId ? "active" : "")+'" data-robot-id="'+esc(r.id)+'"><span><strong>'+esc(r.id)+'</strong><small>'+esc(r.location || "Position unknown")+' · '+(r.battery == null ? "Battery unknown" : esc(r.battery)+"%")+'</small></span><span class="status-badge">'+esc(!connected || r.stale ? "STALE" : r.paused ? "PAUSE REQUESTED" : r.status)+'</span></button>').join("") || "No commissioned vehicles reported";
  $("robotMarkers").innerHTML = robots.map(r => {
    const p = position(r.x,r.y);
    return p ? '<button class="robot-marker '+(!connected || r.stale ? "alert" : "")+'" style="left:'+p[0]+'%;top:'+p[1]+'%" data-robot-id="'+esc(r.id)+'">'+esc(r.id)+'</button>' : "";
  }).join("");
  $("selectedRobotName").textContent = current?.id || "No vehicle selected";
  $("robotState").textContent = current ? (!connected ? "STALE" : current.paused ? "PAUSE REQUESTED" : current.status) : "UNKNOWN";
  $("batteryValue").textContent = current?.battery == null ? "Unknown" : current.battery+"%";
  $("locationValue").textContent = current?.location || "Unknown";
  $("taskValue").textContent = current?.task || "No reported order";
  $("velocityValue").textContent = current?.velocity == null ? "Unknown" : current.velocity+" m/s";
  $("navigateForm").querySelector('[type="submit"]').disabled = !connected || !current?.online || current?.stale || current?.paused || !points.length;
  $("resumeButton").disabled = !connected;
}
const api = new FleetAPI(state => {
  robots = state.robots; upstreamOnline = state.upstreamOnline;
  if (!robots.some(r => r.id === selectedRobotId)) selectedRobotId = robots[0]?.id || null;
  render();
}, connected => { streamOnline = connected; render(); });
async function run(action) { try { await action(); } catch (error) { log(error.message); } }
for (const id of ["robotList","robotMarkers"]) $(id).addEventListener("click", e => {
  const row = e.target.closest("[data-robot-id]"); if (row) { selectedRobotId = row.dataset.robotId; render(); }
});
$("controlKey").addEventListener("input", e => { api.key = e.target.value; });
$("navigateForm").addEventListener("submit", e => {
  e.preventDefault(); run(async () => {
    const content = {to: $("toPoint").value, robotId: selectedRobotId};
    if (pendingSubmission && JSON.stringify(pendingSubmission.content) !== JSON.stringify(content))
      throw new Error("Resolve pending request "+pendingSubmission.requestId+" before changing destination or vehicle");
    if (!pendingSubmission)
      pendingSubmission = {content, requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("")};
    let result;
    try { result = await api.order({...content,requestId: pendingSubmission.requestId}); }
    catch (error) { if (error.definitive) pendingSubmission = null; throw error; }
    pendingSubmission = null; log("Order "+result.id+" accepted; awaiting execution feedback");
  });
});
for (const [id,op] of [["estopButton","pause"],["resumeButton","resume"]]) $(id).addEventListener("click", () => run(async () => {
  const result = await api.fleet(op);
  log(op+": "+result.results.map(r => r.id+" "+(r.accepted ? "requested" : r.detail)).join("; ")+". Await vehicle confirmation.");
}));
$("cancelOrder").addEventListener("click", () => run(async () => {
  const r = robots.find(r => r.id === selectedRobotId); if (!r?.task) throw new Error("No reported order");
  await api.cancel(r.task); log("Withdrawal requested; awaiting vehicle confirmation");
}));
document.querySelectorAll("[data-command]").forEach(b => { b.disabled = true; b.title = "Teleoperation is not enabled in this release"; });
render();
run(async () => {
  layout = await api.start(); points = layout.points;
  $("toPoint").innerHTML = points.map(p => '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
  $("fromPoint").innerHTML = "<option>Actual vehicle position</option>"; $("fromPoint").disabled = true;
  $("mapPoints").innerHTML = points.map(p => { const xy = position(p.x,p.y); return xy ? '<div class="map-point" style="left:'+xy[0]+'%;top:'+xy[1]+'%">'+esc(p.id)+'</div>' : ""; }).join("");
  render();
});
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(e => log(e.message));
