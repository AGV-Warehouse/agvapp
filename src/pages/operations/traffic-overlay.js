// Live traffic layer for the operations map, built only from what openTCS
// reports: each vehicle's planned route (its transport order's current drive
// order), the resources it holds, and why it is waiting when another vehicle
// holds the resource it needs next. Nothing here is inferred from video or
// drawn by hand; when openTCS does not say, the layer shows nothing.
(function (root) {
  'use strict';

  const COLORS = ['#2f6fe4', '#18a058', '#9b51e0', '#d9480f', '#0b8ea3', '#c2255c'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  // Remaining steps of the vehicle's active drive order, from where it is now.
  function remainingRoute(robot, orders) {
    if (!robot?.task) return [];
    const order = (orders || []).find(o => o?.name === robot.task);
    if (!order || ['FINISHED', 'FAILED', 'WITHDRAWN'].includes(order.state)) return [];
    const drives = order.driveOrders || [];
    const drive = drives[order.currentDriveOrderIndex] || drives.find(d => d?.state !== 'FINISHED') || null;
    const steps = Array.isArray(drive?.route?.steps) ? drive.route.steps : [];
    const at = robot.location;
    // Take whichever is further along: the step openTCS reports as travelled,
    // or the step that starts at the vehicle's reported point.
    const reported = Number.isInteger(order.currentRouteStepIndex) && drive === drives[order.currentDriveOrderIndex]
      ? order.currentRouteStepIndex : -1;
    let fromPoint = steps.findIndex(s => s.sourcePoint === at);
    if (fromPoint < 0) {
      const arrived = steps.findIndex(s => s.destinationPoint === at);
      fromPoint = arrived >= 0 ? arrived + 1 : 0;
    }
    const start = Math.max(reported, fromPoint);
    return steps.slice(start).map(s => ({path: s.path, from: s.sourcePoint, to: s.destinationPoint}));
  }

  // The first resource, in route order, that the vehicle has claimed but not
  // been granted and that another vehicle currently holds (openTCS allocation
  // is exclusive). openTCS requests a set at a time, e.g. [R-3:reverse, P-3],
  // so the held one may not be the very first name.
  function blockingResource(robot, robots) {
    const allocated = new Set(robot?.allocated || []);
    for (const name of robot?.claimed || []) {
      if (allocated.has(name)) continue;
      const holder = (robots || []).find(other => other !== robot && (other.allocated || []).includes(name));
      if (holder) return {resource: name, holder: holder.id};
    }
    return null;
  }

  // One plain-language status per vehicle, most serious first.
  function status(robot, robots, orders) {
    if (!robot) return null;
    if (robot.stale || robot.online === false) return {level: 'alert', text: '离线或状态已过期，位置和任务不可信'};
    if (robot.status === 'ERROR') return {level: 'alert', text: '车辆报告错误'};
    const order = robot.task && (orders || []).find(o => o?.name === robot.task);
    if (order?.state === 'FAILED') return {level: 'alert', text: '当前订单失败'};
    if (robot.paused) return {level: 'warn', text: '已暂停：收到运营暂停请求，不会继续派发'};
    const block = robot.task ? blockingResource(robot, robots) : null;
    if (block) return {level: 'warn', text: `等待 ${block.holder} 让出 ${block.resource}`, ...block};
    if (robot.task && robot.status === 'EXECUTING') return {level: 'info', text: '执行中'};
    if (robot.task) return {level: 'info', text: '已接单，等待开始执行'};
    return null;
  }

  function color(index) { return COLORS[index % COLORS.length]; }

  // SVG for routes, held resources and waiting markers. `geometry` maps model
  // ids to SVG coordinates: points (id -> [x, y]) and paths (id -> [a, b]).
  function render({robots = [], orders = [], geometry, positions = new Map(), unit = 1, selected = []}) {
    let routes = '', held = '', notes = '';
    robots.forEach((robot, index) => {
      const c = color(index);
      const focus = !selected.length || selected.includes(robot.id);
      const opacity = focus ? 0.85 : 0.3;
      const steps = remainingRoute(robot, orders);
      const segments = steps.map(step => geometry.paths.get(step.path) ||
        (geometry.points.get(step.from) && geometry.points.get(step.to) ? [geometry.points.get(step.from), geometry.points.get(step.to)] : null)).filter(Boolean);
      if (segments.length) {
        const d = segments.map(([a, b]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`).join(' ');
        const end = segments[segments.length - 1][1];
        routes += `<g class="traffic-route" opacity="${opacity}"><title>${esc(robot.id)} · openTCS 规划路线（剩余 ${segments.length} 段）</title>` +
          `<path d="${d}" stroke="${c}" stroke-width="${6 * unit}"/>` +
          `<circle cx="${end[0]}" cy="${end[1]}" r="${8 * unit}" fill="none" stroke="${c}" stroke-width="${2.5 * unit}"/></g>`;
      }
      for (const name of robot.allocated || []) {
        const path = geometry.paths.get(name), point = geometry.points.get(name);
        if (path) held += `<path class="traffic-held" d="M${path[0][0]} ${path[0][1]} L${path[1][0]} ${path[1][1]}" stroke="${c}" stroke-width="${10 * unit}" opacity="${focus ? 0.35 : 0.15}"><title>${esc(robot.id)} 占用 ${esc(name)}</title></path>`;
        else if (point) held += `<rect class="traffic-held" x="${point[0] - 7 * unit}" y="${point[1] - 7 * unit}" width="${14 * unit}" height="${14 * unit}" fill="${c}" opacity="${focus ? 0.3 : 0.12}"><title>${esc(robot.id)} 占用 ${esc(name)}</title></rect>`;
      }
      const state = status(robot, robots, orders), at = positions.get(robot.id);
      if (state && state.level !== 'info' && at) {
        const width = Math.max(90, state.text.length * 11) * unit;
        notes += `<g class="traffic-note ${state.level}" pointer-events="none"><rect x="${at[0] + 14 * unit}" y="${at[1] - 34 * unit}" width="${width}" height="${20 * unit}" rx="${4 * unit}"/>` +
          `<text x="${at[0] + 20 * unit}" y="${at[1] - 20 * unit}" font-size="${11 * unit}">${esc(state.text)}</text></g>`;
        if (state.resource) {
          const target = geometry.paths.get(state.resource)?.[0] || geometry.points.get(state.resource);
          if (target) notes += `<path class="traffic-wait-link" d="M${at[0]} ${at[1]} L${target[0]} ${target[1]}" stroke-width="${2 * unit}" stroke-dasharray="${3 * unit} ${4 * unit}"/>`;
        }
      }
    });
    return held + routes + notes;
  }

  // Short list for the alert strip: everything that is not plain "running".
  function alerts(robots, orders) {
    return (robots || []).map(robot => ({id: robot.id, ...status(robot, robots, orders)}))
      .filter(a => a.level === 'alert' || a.level === 'warn');
  }

  const api = {remainingRoute, blockingResource, status, render, alerts, color};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrafficOverlay = api;
})(globalThis);
