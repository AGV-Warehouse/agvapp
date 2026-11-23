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

  // Resources of the next step the vehicle waits to be granted: openTCS
  // claims the rest of the route and allocates it one step (a path and its
  // end point, e.g. [R-3:reverse, P-3]) at a time, so only the first
  // ungranted pair can hold the vehicle up right now.
  function nextClaim(robot) {
    const allocated = new Set(robot?.allocated || []);
    return (robot?.claimed || []).filter(name => !allocated.has(name)).slice(0, 2);
  }

  // Who holds what the vehicle needs next. Allocation is exclusive, and a
  // SINGLE_VEHICLE_ONLY block (a crossing zone) is granted to one vehicle at
  // a time, so a held member of the same block blocks the whole zone.
  function blockingResource(robot, robots, blocks = []) {
    const others = (robots || []).filter(other => other !== robot && other?.id !== robot?.id);
    const next = nextClaim(robot);
    for (const name of next) {
      const holder = others.find(other => (other.allocated || []).includes(name));
      if (holder) return {resource: name, holder: holder.id};
    }
    for (const name of next) {
      for (const block of blocks || []) {
        if (block?.type !== 'SINGLE_VEHICLE_ONLY' || !(block.members || []).includes(name)) continue;
        const holder = others.find(other => (other.allocated || []).some(held => block.members.includes(held)));
        if (holder) return {resource: name, holder: holder.id, zone: block.id};
      }
    }
    return null;
  }

  // Operator words for an openTCS resource name. Compiled names carry '~':
  // `<spot>~hold` is the wait point before a crossing, `<route>~spur` the half
  // of a parking spur toward the spot.
  function resourceLabel(name, {model, placeName} = {}) {
    if (!name) return '';
    const place = id => (placeName ? placeName(id) : '') || id;
    // A label the scene gave this exact resource wins (compiled wait points
    // carry one, e.g. the scene name of the spot plus "wait point").
    const own = (model?.points || []).find(p => p.id === name)?.label;
    if (own) return own;
    const [base, suffix] = String(name).split('~');
    if (suffix === 'hold') return `${place(base)} 前等待点`;
    const path = (model?.paths || []).find(p => p.id === name);
    if (path?.label) return path.label;
    if (path?.source && path?.target) {
      const end = id => resourceLabel(id, {model, placeName});
      return `${end(path.source)} → ${end(path.target)} 路段`;
    }
    return place(name);
  }

  // One plain-language status per vehicle, most serious first. `context`
  // gives model blocks and place names: {model, placeName}.
  function status(robot, robots, orders, context = {}) {
    if (!robot) return null;
    if (robot.stale || robot.online === false) return {level: 'alert', text: '离线或状态已过期，位置和任务不可信'};
    if (robot.status === 'ERROR') return {level: 'alert', text: '车辆报告错误'};
    const order = robot.task && (orders || []).find(o => o?.name === robot.task);
    if (order?.state === 'FAILED') return {level: 'alert', text: '当前订单失败'};
    if (robot.paused) return {level: 'warn', text: '已暂停：收到运营暂停请求，不会继续派发'};
    const work = robot.stationWork;
    const at = work ? resourceLabel(work.station, context) : '';
    if (work?.needsOperator) return {level: 'warn', text: `在 ${at} 等待操作员确认`, kind: 'operator'};
    let block = robot.task ? blockingResource(robot, robots, context.model?.blocks) : null;
    if (block) {
      // A zone is named by the crossing point in the requested step.
      const points = new Set((context.model?.points || []).map(p => p.id));
      const members = (context.model?.blocks || []).find(z => z.id === block.zone)?.members || [];
      const ahead = remainingRoute(robot, orders).map(step => step.to);
      const crossing = !block.zone ? block.resource : [...nextClaim(robot), ...ahead].find(name => points.has(name) && members.includes(name)) ||
        members.find(name => points.has(name) && !name.includes('~')) || block.resource;
      const what = resourceLabel(crossing, context);
      const wait = block.zone ? `等待 ${block.holder} 通过 ${what} 路口` : `等待 ${block.holder} 让出 ${what}`;
      // Still driving on granted path toward the wait point: say so, no alarm.
      const route = remainingRoute(robot, orders);
      const stop = route.find(step => !(robot.allocated || []).includes(step.path));
      // Every step to this stop is granted: the claim is for a later leg
      // (after the station work), so there is nothing to wait for yet.
      if (route.length && !stop) block = null;
      else if (route.length && stop !== route[0]) {
        return {level: 'info', kind: 'approach', ...block, text: `前往 ${resourceLabel(stop.from, context)}，到后${wait}`};
      } else return {level: 'warn', kind: 'traffic', ...block, text: wait};
    }
    if (work?.atStation) return {level: 'info', text: work.kind === 'charge' ? `在 ${at} 充电` : `在 ${at} 作业`};
    if (robot.task && robot.status === 'EXECUTING') return {level: 'info', text: '执行中'};
    if (robot.task) return {level: 'info', text: '已接单，等待开始执行'};
    return null;
  }

  function color(index) { return COLORS[index % COLORS.length]; }

  // SVG for routes, held resources and waiting markers. `geometry` maps model
  // ids to SVG coordinates: points (id -> [x, y]) and paths (id -> [a, b]).
  function render({robots = [], orders = [], geometry, positions = new Map(), unit = 1, selected = [], context = {}}) {
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
        routes += `<g class="traffic-route" opacity="${opacity}"><title>${esc(robot.id)} 规划路线：剩余 ${segments.length} 段，终点 ${esc(resourceLabel(steps[steps.length - 1].to, context))}</title>` +
          `<path d="${d}" stroke="${c}" stroke-width="${6 * unit}"/>` +
          `<circle cx="${end[0]}" cy="${end[1]}" r="${8 * unit}" fill="none" stroke="${c}" stroke-width="${2.5 * unit}"/></g>`;
      }
      for (const name of robot.allocated || []) {
        const path = geometry.paths.get(name), point = geometry.points.get(name);
        if (path) held += `<path class="traffic-held" d="M${path[0][0]} ${path[0][1]} L${path[1][0]} ${path[1][1]}" stroke="${c}" stroke-width="${10 * unit}" opacity="${focus ? 0.35 : 0.15}"><title>${esc(robot.id)} 占用 ${esc(resourceLabel(name, context))}</title></path>`;
        else if (point) held += `<rect class="traffic-held" x="${point[0] - 7 * unit}" y="${point[1] - 7 * unit}" width="${14 * unit}" height="${14 * unit}" fill="${c}" opacity="${focus ? 0.3 : 0.12}"><title>${esc(robot.id)} 占用 ${esc(resourceLabel(name, context))}</title></rect>`;
      }
      // Requested next but not yet granted: outlined, not filled.
      for (const name of robot.task ? nextClaim(robot) : []) {
        const path = geometry.paths.get(name), point = geometry.points.get(name);
        const label = `${esc(robot.id)} 已申请、尚未获准 ${esc(resourceLabel(name, context))}`;
        if (path) held += `<path class="traffic-claimed" d="M${path[0][0]} ${path[0][1]} L${path[1][0]} ${path[1][1]}" stroke="${c}" stroke-width="${2 * unit}" stroke-dasharray="${4 * unit} ${3 * unit}" opacity="${focus ? 0.9 : 0.3}"><title>${label}</title></path>`;
        else if (point) held += `<rect class="traffic-claimed" x="${point[0] - 8 * unit}" y="${point[1] - 8 * unit}" width="${16 * unit}" height="${16 * unit}" stroke="${c}" stroke-width="${1.5 * unit}" stroke-dasharray="${3 * unit} ${2 * unit}" opacity="${focus ? 0.9 : 0.3}"><title>${label}</title></rect>`;
      }
      const state = status(robot, robots, orders, context), at = positions.get(robot.id);
      if (state && state.level !== 'info' && at) {
        const width = (Math.max(90, state.text.length * 11.5) + 12) * unit;
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
  function alerts(robots, orders, context = {}) {
    return (robots || []).map(robot => ({id: robot.id, ...status(robot, robots, orders, context)}))
      .filter(a => a.level === 'alert' || a.level === 'warn');
  }

  const api = {remainingRoute, nextClaim, blockingResource, resourceLabel, status, render, alerts, color};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrafficOverlay = api;
})(globalThis);
