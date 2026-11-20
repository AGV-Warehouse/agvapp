// RTS-style interaction for the live operations map: cursor-anchored smooth
// zoom, drag to pan, Shift+drag box select, click / Ctrl+click select, a
// minimap, and right-click a station to dispatch the selected vehicle.
//
// This module only decides *what the operator asked for*. Sending an order is
// delegated to the portal's existing dispatch path, which keeps its receipts,
// duplicate protection and blocking reasons. Nothing here moves a vehicle.
(function (root) {
  'use strict';

  const ZOOM_MIN = 0.08, ZOOM_MAX = 12;

  // Zoom so the map point under `anchor` stays under the cursor.
  function zoomAt(camera, factor, anchor, fit) {
    const w = camera.w * factor, h = camera.h * factor;
    if (!(w >= fit.w * ZOOM_MIN && w <= fit.w * ZOOM_MAX)) return null;
    const a = anchor || {x: camera.x + camera.w / 2, y: camera.y + camera.h / 2};
    return {x: a.x - (a.x - camera.x) * factor, y: a.y - (a.y - camera.y) * factor, w, h};
  }

  function lerpCamera(a, b, t) {
    const k = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3); // ease-out cubic
    return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k};
  }

  function normalizedRect(a, b) {
    return {x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y)};
  }

  // Vehicles ({id, x, y} in map SVG units) whose marker centre is inside the box.
  function boxSelect(vehicles, rect) {
    return vehicles.filter(v => Number.isFinite(v.x) && Number.isFinite(v.y) &&
      v.x >= rect.x0 && v.x <= rect.x1 && v.y >= rect.y0 && v.y <= rect.y1).map(v => v.id);
  }

  // Click semantics: plain click replaces, Ctrl/Meta/Shift click toggles.
  function clickSelect(current, id, additive) {
    if (!additive) return [id];
    return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  }

  // What a right-click on a station should do with the current selection.
  function dispatchPlan(stationId, selection, destinations) {
    const destination = destinations.find(p => p.destination === stationId || p.id === stationId);
    if (!destination) return {kind: 'unavailable'};
    if (!selection.length) return {kind: 'no-selection', destination};
    if (selection.length === 1) return {kind: 'single', destination, robotId: selection[0]};
    return {kind: 'choose', destination, robotIds: [...selection]};
  }

  // Id of the item ({id, x, y}) closest to p within `radius`, else null.
  function nearest(items, p, radius) {
    let best = null, distance = radius;
    for (const item of items) {
      const d = Math.hypot(item.x - p.x, item.y - p.y);
      if (d <= distance) { best = item.id; distance = d; }
    }
    return best;
  }

  // Camera velocity (map units per ms) from the last ~100 ms of a drag; null
  // when the pointer was held still before release (no fling).
  function panVelocity(samples, at) {
    const recent = samples.filter(s => at - s.t <= 100);
    if (recent.length < 2 || at - recent[recent.length - 1].t > 50) return null;
    const a = recent[0], b = recent[recent.length - 1], dt = b.t - a.t;
    if (dt <= 0) return null;
    return {x: (b.x - a.x) / dt, y: (b.y - a.y) / dt};
  }

  function bounds(items) {
    const pts = items.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
  }

  function mount(o) {
    const {svg, host, doc = root.document} = o;
    const ns = 'http://www.w3.org/2000/svg';
    let target = null, from = null, startedAt = 0, frame = 0;
    let gesture = null, glide = 0;
    const now = () => root.performance?.now() ?? Date.now();

    function localPoint(event) {
      const p = svg.createSVGPoint();
      p.x = event.clientX; p.y = event.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    }

    function step() {
      frame = 0;
      if (!target) return;
      const t = Math.min(1, (now() - startedAt) / 180);
      o.setCamera(lerpCamera(from, target, t));
      if (t < 1) frame = root.requestAnimationFrame(step);
      else target = null;
      renderMinimap();
    }
    function animateTo(camera) {
      from = {...o.getCamera()};
      target = camera;
      startedAt = now();
      if (!frame) frame = root.requestAnimationFrame(step);
    }
    function zoomBy(factor, anchor) {
      const base = target || o.getCamera();
      const next = zoomAt(base, factor, anchor, o.getFit());
      if (next) animateTo(next);
    }
    function settle() {
      if (frame) root.cancelAnimationFrame(frame);
      if (glide) root.cancelAnimationFrame(glide);
      frame = glide = 0;
      target = null;
    }
    // Keep sliding after a quick drag, slowing down like Google Maps.
    function coast(velocity) {
      let last = now(), v = velocity;
      const tick = () => {
        const t = now(), dt = Math.min(48, t - last);
        last = t;
        v = {x: v.x * Math.exp(-dt / 260), y: v.y * Math.exp(-dt / 260)};
        const camera = o.getCamera();
        o.setCamera({...camera, x: camera.x + v.x * dt, y: camera.y + v.y * dt});
        renderMinimap();
        glide = Math.hypot(v.x, v.y) * 16 > 0.25 * o.unit() ? root.requestAnimationFrame(tick) : 0;
      };
      glide = root.requestAnimationFrame(tick);
    }

    // Selection box (drawn in map units on top of everything).
    const box = doc.createElementNS(ns, 'rect');
    box.setAttribute('class', 'rts-select-box');
    box.setAttribute('visibility', 'hidden');
    svg.append(box);
    function drawBox(a, b) {
      const r = normalizedRect(a, b);
      box.setAttribute('x', r.x0); box.setAttribute('y', r.y0);
      box.setAttribute('width', r.x1 - r.x0); box.setAttribute('height', r.y1 - r.y0);
      box.setAttribute('visibility', 'visible');
    }

    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const item = event.target.closest('.map-item');
      if (item && !event.shiftKey) return; // clicks on objects are handled below
      settle();
      gesture = {id: event.pointerId, start: localPoint(event), select: event.shiftKey && o.canSelect(), moved: false, samples: []};
      svg.setPointerCapture(event.pointerId);
      if (!gesture.select) svg.classList.add('panning');
    });
    svg.addEventListener('pointermove', event => {
      const p = localPoint(event);
      o.onPointer?.(p);
      if (!gesture || gesture.id !== event.pointerId) return;
      gesture.moved = gesture.moved || Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 2 * o.unit();
      if (gesture.select) drawBox(gesture.start, p);
      else {
        const camera = o.getCamera();
        const next = {...camera, x: camera.x + gesture.start.x - p.x, y: camera.y + gesture.start.y - p.y};
        o.setCamera(next);
        gesture.samples.push({t: now(), x: next.x, y: next.y});
        if (gesture.samples.length > 8) gesture.samples.shift();
        renderMinimap();
      }
    });
    function endGesture(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (gesture.select && gesture.moved && event.type === 'pointerup') {
        const ids = boxSelect(o.vehicles(), normalizedRect(gesture.start, localPoint(event)));
        o.setSelection(event.ctrlKey || event.metaKey ? [...new Set([...o.getSelection(), ...ids])] : ids);
      } else if (!gesture.moved && event.type === 'pointerup' && !event.target.closest?.('.map-item')) {
        o.setSelection([]); // click on empty map clears the selection
      } else if (!gesture.select && gesture.moved && event.type === 'pointerup') {
        const v = panVelocity(gesture.samples, now());
        if (v) coast(v);
      }
      box.setAttribute('visibility', 'hidden');
      svg.classList.remove('panning');
      gesture = null;
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(type, endGesture);

    // Vehicles: select without opening the details drawer; double-click opens it.
    // With vehicles selected, a left click on a station is a dispatch command.
    svg.addEventListener('click', event => {
      const station = event.target.closest('[data-object-kind="stations"]');
      if (station && o.getSelection().length) {
        event.stopImmediatePropagation();
        o.onStationCommand(station.dataset.objectId, event.clientX, event.clientY);
        return;
      }
      const item = event.target.closest('[data-object-kind="robots"]');
      if (!item) return;
      event.stopImmediatePropagation();
      o.setSelection(clickSelect(o.getSelection(), item.dataset.objectId, event.ctrlKey || event.metaKey || event.shiftKey));
    }, true);
    svg.addEventListener('dblclick', event => {
      const item = event.target.closest('[data-object-kind="robots"]');
      if (item) o.openDetails(item.dataset.objectId);
    });

    svg.addEventListener('wheel', event => {
      event.preventDefault();
      if (glide) { root.cancelAnimationFrame(glide); glide = 0; }
      const factor = Math.pow(1.0015, Math.max(-300, Math.min(300, event.deltaY * (event.deltaMode === 1 ? 33 : 1))));
      zoomBy(factor, localPoint(event));
    }, {passive: false});

    // The whole live map control owns the right button (map, minimap, labels,
    // overlays): the browser menu never opens here. A right-click within
    // ~40 px of a station counts as on that station.
    host.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (!svg.getScreenCTM()) return;
      const station = event.target.closest?.('[data-object-kind="stations"]')?.dataset.objectId ||
        nearest(o.stations?.() || [], localPoint(event), 40 * o.unit());
      if (station) o.onStationCommand(station, event.clientX, event.clientY);
      else o.onEmptyCommand?.(event.clientX, event.clientY);
    });

    // Minimap: the whole site, the vehicles and the current view.
    const mini = doc.createElement('div');
    mini.className = 'rts-minimap';
    mini.setAttribute('aria-label', '小地图：点击或拖动移动视野');
    mini.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g class="mm-layout"></g><g class="mm-vehicles"></g><rect class="mm-view"/></svg>';
    host.append(mini);
    const miniSvg = mini.firstChild;
    let miniKey = '';
    function renderMinimap() {
      const data = o.minimap();
      const area = bounds([...data.points, ...data.vehicles.map(v => [v.x, v.y])]);
      mini.hidden = !area;
      if (!area) return;
      const pad = Math.max(area.w, area.h, 60) * 0.12;
      const view = {x: area.x - pad, y: area.y - pad, w: area.w + 2 * pad, h: area.h + 2 * pad};
      miniSvg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
      const stroke = Math.max(view.w, view.h) / 120;
      const key = JSON.stringify([data.paths, data.stations, stroke]);
      if (key !== miniKey) {
        miniKey = key;
        miniSvg.querySelector('.mm-layout').innerHTML =
          data.paths.map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${stroke}"/>`).join('') +
          data.stations.map(([x, y]) => `<rect x="${x - stroke * 2}" y="${y - stroke * 2}" width="${stroke * 4}" height="${stroke * 4}"/>`).join('');
      }
      miniSvg.querySelector('.mm-vehicles').innerHTML = data.vehicles.map(v =>
        `<circle cx="${v.x}" cy="${v.y}" r="${stroke * (v.selected ? 4 : 3)}" class="${v.selected ? 'selected' : ''}"/>`).join('');
      const c = o.getCamera(), rect = miniSvg.querySelector('.mm-view');
      rect.setAttribute('x', c.x); rect.setAttribute('y', c.y);
      rect.setAttribute('width', c.w); rect.setAttribute('height', c.h);
      rect.setAttribute('stroke-width', stroke);
    }
    function miniPoint(event) {
      const p = miniSvg.createSVGPoint();
      p.x = event.clientX; p.y = event.clientY;
      return p.matrixTransform(miniSvg.getScreenCTM().inverse());
    }
    let miniDrag = null;
    function centreOn(p) {
      const c = o.getCamera();
      o.setCamera({...c, x: p.x - c.w / 2, y: p.y - c.h / 2});
      renderMinimap();
    }
    mini.addEventListener('pointerdown', event => {
      settle();
      miniDrag = event.pointerId;
      mini.setPointerCapture(event.pointerId);
      centreOn(miniPoint(event));
    });
    mini.addEventListener('pointermove', event => { if (miniDrag === event.pointerId) centreOn(miniPoint(event)); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) mini.addEventListener(type, () => { miniDrag = null; });

    return {zoomBy, animateTo, settle, renderMinimap};
  }

  // A small confirmation card next to the cursor. Dispatching a real vehicle
  // is an explicit second click (or Enter), never the right-click itself.
  function commandCard({doc = root.document, x, y, title, lines = [], choices = [], confirmLabel, onConfirm}) {
    doc.querySelector('.rts-command-card')?.remove();
    const card = doc.createElement('div');
    card.className = 'rts-command-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', title);
    const h = doc.createElement('strong');
    h.textContent = title;
    card.append(h);
    for (const text of lines) {
      const p = doc.createElement('p');
      p.textContent = text;
      card.append(p);
    }
    let chosen = choices[0] ?? null;
    if (choices.length > 1) {
      const group = doc.createElement('div');
      group.className = 'rts-command-choices';
      for (const id of choices) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'button';
        b.textContent = id;
        b.setAttribute('aria-pressed', String(id === chosen));
        b.onclick = () => {
          chosen = id;
          for (const other of group.children) other.setAttribute('aria-pressed', String(other === b));
        };
        group.append(b);
      }
      card.append(group);
    }
    const status = doc.createElement('p');
    status.className = 'rts-command-status';
    status.setAttribute('role', 'status');
    const actions = doc.createElement('div');
    actions.className = 'rts-command-actions';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button';
    cancel.textContent = '取消';
    actions.append(cancel);
    let confirm = null;
    if (onConfirm) {
      confirm = doc.createElement('button');
      confirm.type = 'button';
      confirm.className = 'button button-primary';
      confirm.textContent = confirmLabel;
      actions.append(confirm);
    }
    card.append(status, actions);
    const close = () => { card.remove(); doc.removeEventListener('keydown', key, true); doc.removeEventListener('pointerdown', outside, true); };
    const key = event => {
      if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && confirm && !confirm.disabled && doc.activeElement?.tagName !== 'BUTTON') confirm.click();
    };
    const outside = event => { if (!card.contains(event.target)) close(); };
    cancel.onclick = close;
    const api = {
      close,
      setStatus(text, kind = '') { status.textContent = text; status.dataset.kind = kind; },
      done(text, kind) {
        api.setStatus(text, kind);
        if (confirm) confirm.remove();
        cancel.textContent = '关闭';
      },
    };
    if (confirm) confirm.onclick = async () => {
      confirm.disabled = true;
      api.setStatus('正在提交，等待回执…');
      try { await onConfirm(chosen, api); }
      finally { if (confirm.isConnected) confirm.disabled = false; }
    };
    doc.body.append(card);
    const vw = root.innerWidth || 1200, vh = root.innerHeight || 800;
    const rect = card.getBoundingClientRect?.() || {width: 280, height: 160};
    card.style.left = `${Math.max(8, Math.min(x + 8, vw - rect.width - 8))}px`;
    card.style.top = `${Math.max(8, Math.min(y + 8, vh - rect.height - 8))}px`;
    doc.addEventListener('keydown', key, true);
    doc.addEventListener('pointerdown', outside, true);
    (confirm || cancel).focus();
    return api;
  }

  const api = {zoomAt, lerpCamera, normalizedRect, boxSelect, clickSelect, dispatchPlan, nearest, panVelocity, bounds, mount, commandCard};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RtsMap = api;
})(globalThis);
