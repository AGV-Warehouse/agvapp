// 3D view of the operations map (three.js, loaded only when the operator
// switches to 3D). It shows the same live data as the 2D map: the plant model
// from openTCS, vehicle poses, each vehicle's remaining openTCS route, the
// resources it holds or has requested, and why it is waiting. It is a view
// only: dispatching stays on the 2D map, and nothing here sends commands.
//
// Coordinates: model metres (x, y) map to three.js (x, 0, -y), so looking
// straight down with "up" = -z shows the plant exactly like the 2D map.
(function (root) {
  'use strict';

  const THREE_SRC = 'vendor/three-0.158.0.min.js';
  const LIFT = {lane: 0.004, held: 0.012, route: 0.02, claimed: 0.03};

  // --- Pure scene description (tested without three.js) -------------------

  function bezier(a, controls, b, steps = 12) {
    const out = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps, u = 1 - t;
      if (controls.length === 1) {
        const [c] = controls;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      } else {
        const [c, d] = controls;
        out.push([
          u ** 3 * a[0] + 3 * u * u * t * c[0] + 3 * u * t * t * d[0] + t ** 3 * b[0],
          u ** 3 * a[1] + 3 * u * u * t * c[1] + 3 * u * t * t * d[1] + t ** 3 * b[1],
        ]);
      }
    }
    return out;
  }

  const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

  // Polyline (metres) of every model path, curves sampled like the 2D map.
  function pathLines(model) {
    const points = new Map([...(model?.points || []), ...(model?.stations || [])].filter(finite).map(p => [p.id, [p.x, p.y]]));
    const lines = new Map();
    for (const path of model?.paths || []) {
      const a = points.get(path.source), b = points.get(path.target);
      if (!a || !b) continue;
      const controls = (path.controlPoints || []).filter(finite).map(p => [p.x, p.y]);
      const curved = (path.connectionType === 'BEZIER' && controls.length === 1) || (path.connectionType === 'BEZIER_3' && controls.length === 2);
      lines.set(path.id, curved ? bezier(a, controls, b) : [a, b]);
    }
    return {points, lines};
  }

  function bounds(model) {
    const all = [...(model?.points || []), ...(model?.stations || [])].filter(finite);
    if (!all.length) return {minX: -2, maxX: 2, minY: -2, maxY: 2};
    const xs = all.map(p => p.x), ys = all.map(p => p.y);
    return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
  }

  // Everything the 3D view draws, as plain data. `traffic` is TrafficOverlay.
  function describe({model, robots = [], orders = [], poses = [], traffic, context = {}}) {
    const {points, lines} = pathLines(model);
    const line = name => lines.get(name);
    const routes = [], held = [], claimed = [], vehicles = [];
    robots.forEach((robot, index) => {
      const color = traffic?.color ? traffic.color(index) : '#2f6fe4';
      const steps = traffic ? traffic.remainingRoute(robot, orders) : [];
      const segments = steps.map(step => lines.get(step.path) ||
        (points.get(step.from) && points.get(step.to) ? [points.get(step.from), points.get(step.to)] : null)).filter(Boolean);
      if (segments.length) routes.push({id: robot.id, color, segments, end: segments[segments.length - 1].at(-1)});
      for (const name of robot.allocated || []) {
        if (line(name)) held.push({id: robot.id, color, name, line: line(name)});
        else if (points.has(name)) held.push({id: robot.id, color, name, point: points.get(name)});
      }
      for (const name of robot.task && traffic ? traffic.nextClaim(robot) : []) {
        if (line(name)) claimed.push({id: robot.id, color, name, line: line(name)});
        else if (points.has(name)) claimed.push({id: robot.id, color, name, point: points.get(name)});
      }
      const pose = poses.find(p => p.id === robot.id);
      const state = traffic ? traffic.status(robot, robots, orders, context) : null;
      if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
        vehicles.push({id: robot.id, color, x: pose.x, y: pose.y, yaw: Number.isFinite(pose.yaw) ? pose.yaw : null,
          note: state && state.level !== 'info' ? state : null});
      }
    });
    // Vehicles with a pose but no fleet record (e.g. a sim robot not yet in
    // openTCS) are still drawn, in grey, without route or status.
    for (const pose of poses) {
      if (!vehicles.some(v => v.id === pose.id) && Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
        vehicles.push({id: pose.id, color: '#8a94a6', x: pose.x, y: pose.y, yaw: Number.isFinite(pose.yaw) ? pose.yaw : null, note: null});
      }
    }
    const stations = (model?.stations || []).filter(finite).map(s => ({id: s.id, label: s.label || s.name || s.id, x: s.x, y: s.y}));
    const halts = (model?.points || []).filter(finite).filter(p => !String(p.id).includes('~')).map(p => ({id: p.id, x: p.x, y: p.y}));
    return {bounds: bounds(model), lanes: [...lines.values()], points: halts, stations, routes, held, claimed, vehicles};
  }

  // Signature of the parts that need new meshes (not vehicle motion).
  function layoutKey(view) {
    return JSON.stringify([view.lanes, view.stations, view.points]);
  }
  function trafficKey(view) {
    return JSON.stringify([view.routes, view.held, view.claimed, view.vehicles.map(v => [v.id, v.color, v.note?.text])]);
  }

  // Shortest-turn interpolation of an angle.
  function lerpAngle(from, to, t) {
    let d = ((to - from + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return from + d * t;
  }

  // --- three.js rendering --------------------------------------------------

  let loading = null;
  function loadThree(doc = root.document) {
    if (root.THREE) return Promise.resolve(root.THREE);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      const url = new URL(THREE_SRC, root.location.href);
      const release = new URL(root.location.href).searchParams.get('portalRelease');
      if (release) url.searchParams.set('portalRelease', release);
      script.src = url.href;
      script.onload = () => (root.THREE ? resolve(root.THREE) : reject(new Error('three.js did not load')));
      script.onerror = () => { loading = null; reject(new Error('three.js could not be downloaded')); };
      doc.head.append(script);
    });
    return loading;
  }

  function webglAvailable(doc = root.document) {
    try {
      const canvas = doc.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (error) {
      return false;
    }
  }

  function textSprite(THREE, text, {color = '#1f2a3a', background = 'rgba(255,255,255,0.92)', border = '#c9d3e0', size = 0.22} = {}) {
    const scale = 4, font = 28 * scale;
    const canvas = root.document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${font}px system-ui, "Microsoft YaHei", sans-serif`;
    const width = Math.ceil(ctx.measureText(text).width) + 28 * scale, height = font + 22 * scale;
    canvas.width = width; canvas.height = height;
    ctx.font = `600 ${font}px system-ui, "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = background; ctx.strokeStyle = border; ctx.lineWidth = 3 * scale;
    const r = 10 * scale;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(2, 2, width - 4, height - 4, r) : ctx.rect(2, 2, width - 4, height - 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.fillText(text, 14 * scale, height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, depthTest: false, transparent: true}));
    sprite.scale.set(size * width / height, size, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // Flat strip along a polyline, `width` metres wide, at height `lift`.
  function strip(THREE, line, width, lift, material) {
    const group = new THREE.Group();
    for (let i = 1; i < line.length; i += 1) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i];
      const length = Math.hypot(bx - ax, by - ay);
      if (length < 1e-6) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length + width * 0.6, 0.006, width), material);
      mesh.position.set((ax + bx) / 2, lift, -(ay + by) / 2);
      mesh.rotation.y = Math.atan2(by - ay, bx - ax);
      group.add(mesh);
    }
    return group;
  }

  function dashed(THREE, line, lift, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints(line.map(([x, y]) => new THREE.Vector3(x, lift, -y)));
    const object = new THREE.Line(geometry, new THREE.LineDashedMaterial({color, dashSize: 0.08, gapSize: 0.06}));
    object.computeLineDistances();
    return object;
  }

  function disposeTree(object) {
    object.traverse(child => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) { material.map?.dispose?.(); material.dispose?.(); }
    });
  }

  function vehicleMesh(THREE, vehicle) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.34),
      new THREE.MeshStandardMaterial({color: vehicle.color, roughness: 0.55, metalness: 0.1}));
    body.position.y = 0.11;
    group.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.26), new THREE.MeshStandardMaterial({color: 0xf3f6fa, roughness: 0.7}));
    top.position.y = 0.215;
    group.add(top);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 12), new THREE.MeshStandardMaterial({color: 0x1f2a3a}));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.2, 0.22, 0);
    group.add(nose);
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), new THREE.MeshStandardMaterial({color: 0x2a2f38}));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0, 0.05, side * 0.18);
      group.add(wheel);
    }
    const label = textSprite(THREE, vehicle.id, {size: 0.16});
    label.position.set(0, 0.42, 0);
    group.add(label);
    group.userData.vehicleId = vehicle.id;
    group.userData.label = label;
    return group;
  }

  function mount(host, {onSelect} = {}) {
    const THREE = root.THREE;
    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);
    renderer.domElement.className = 'map-3d-canvas';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f9);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2d0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 10, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    const layout = new THREE.Group(), traffic = new THREE.Group(), fleet = new THREE.Group();
    scene.add(layout, traffic, fleet);

    // Orbit camera around a target: spherical (distance, azimuth, tilt).
    const orbit = {target: new THREE.Vector3(), distance: 10, azimuth: 0, tilt: 0.85};
    const goal = {target: new THREE.Vector3(), distance: 10, azimuth: 0, tilt: 0.85};
    let view = null, layoutSignature = '', trafficSignature = '', fitted = false;
    const vehicles = new Map();
    let frame = 0, last = 0, disposed = false;

    function placeCamera() {
      const {target, distance, azimuth, tilt} = orbit;
      camera.position.set(
        target.x + distance * Math.sin(tilt) * Math.sin(azimuth),
        target.y + distance * Math.cos(tilt),
        target.z + distance * Math.sin(tilt) * Math.cos(azimuth),
      );
      camera.up.set(0, 1, 0);
      if (tilt < 0.02) camera.up.set(-Math.sin(azimuth), 0, -Math.cos(azimuth));
      camera.lookAt(target);
    }

    function fit(tilt = 0.85) {
      if (!view) return;
      const b = view.bounds;
      goal.target.set((b.minX + b.maxX) / 2, 0, -(b.minY + b.maxY) / 2);
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 2) + 1.5;
      goal.distance = span / (2 * Math.tan((camera.fov * Math.PI) / 360)) * (camera.aspect < 1 ? 1.6 / camera.aspect : 1.1);
      goal.azimuth = 0;
      goal.tilt = tilt;
      wake();
    }

    function buildLayout() {
      disposeTree(layout);
      layout.clear();
      const b = view.bounds, margin = 1;
      const width = b.maxX - b.minX + 2 * margin, depth = b.maxY - b.minY + 2 * margin;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({color: 0xe9edf3, roughness: 0.95}));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((b.minX + b.maxX) / 2, 0, -(b.minY + b.maxY) / 2);
      layout.add(floor);
      const cells = Math.max(1, Math.round(Math.max(width, depth)));
      const grid = new THREE.GridHelper(cells, cells, 0xcfd7e2, 0xdde3eb);
      grid.position.set(floor.position.x, 0.001, floor.position.z);
      layout.add(grid);
      const laneMaterial = new THREE.MeshStandardMaterial({color: 0xa9b6c8, roughness: 0.9});
      for (const lane of view.lanes) layout.add(strip(THREE, lane, 0.1, LIFT.lane, laneMaterial));
      const pointMaterial = new THREE.MeshStandardMaterial({color: 0x8a9ab0});
      for (const point of view.points) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16), pointMaterial);
        disc.position.set(point.x, 0.008, -point.y);
        layout.add(disc);
      }
      const stationMaterial = new THREE.MeshStandardMaterial({color: 0x5b6b82, roughness: 0.6});
      for (const station of view.stations) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), new THREE.MeshStandardMaterial({color: 0xd6deea}));
        pad.position.set(station.x, 0.01, -station.y);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), stationMaterial);
        post.position.set(station.x - 0.25, 0.25, -station.y - 0.25);
        const label = textSprite(THREE, station.label, {size: 0.18, color: '#33435a'});
        label.position.set(station.x, 0.62, -station.y);
        layout.add(pad, post, label);
      }
    }

    function buildTraffic() {
      disposeTree(traffic);
      traffic.clear();
      for (const item of view.held) {
        const material = new THREE.MeshBasicMaterial({color: item.color, transparent: true, opacity: 0.3, depthWrite: false});
        if (item.line) traffic.add(strip(THREE, item.line, 0.22, LIFT.held, material));
        else {
          const square = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.006, 0.3), material);
          square.position.set(item.point[0], LIFT.held, -item.point[1]);
          traffic.add(square);
        }
      }
      for (const item of view.claimed) {
        if (item.line) traffic.add(dashed(THREE, item.line, LIFT.claimed, item.color));
        else {
          const [x, y] = item.point, h = 0.17;
          traffic.add(dashed(THREE, [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]], LIFT.claimed, item.color));
        }
      }
      for (const route of view.routes) {
        const material = new THREE.MeshBasicMaterial({color: route.color, transparent: true, opacity: 0.85, depthWrite: false});
        for (const segment of route.segments) traffic.add(strip(THREE, segment, 0.07, LIFT.route, material));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 32), new THREE.MeshBasicMaterial({color: route.color}));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(route.end[0], 0.03, -route.end[1]);
        traffic.add(ring);
      }
    }

    function syncVehicles() {
      const live = new Set(view.vehicles.map(v => v.id));
      for (const [id, entry] of vehicles) {
        if (!live.has(id)) { fleet.remove(entry.group); disposeTree(entry.group); vehicles.delete(id); }
      }
      for (const vehicle of view.vehicles) {
        let entry = vehicles.get(vehicle.id);
        if (!entry || entry.color !== vehicle.color) {
          if (entry) { fleet.remove(entry.group); disposeTree(entry.group); }
          entry = {group: vehicleMesh(THREE, vehicle), color: vehicle.color, x: vehicle.x, y: vehicle.y, yaw: vehicle.yaw ?? 0, note: null, noteText: ''};
          fleet.add(entry.group);
          vehicles.set(vehicle.id, entry);
        }
        entry.target = vehicle;
        const text = vehicle.note?.text || '';
        if (text !== entry.noteText) {
          if (entry.note) { entry.group.remove(entry.note); disposeTree(entry.note); entry.note = null; }
          if (text) {
            const alert = vehicle.note.level === 'alert';
            entry.note = textSprite(THREE, text, {size: 0.17, color: alert ? '#a11d1d' : '#7a4b00',
              background: alert ? 'rgba(253,236,236,0.96)' : 'rgba(255,247,230,0.96)', border: alert ? '#d64545' : '#e8a33d'});
            entry.note.position.set(0, 0.7, 0);
            entry.group.add(entry.note);
          }
          entry.noteText = text;
        }
      }
    }

    // Draw continuously only while something moves; otherwise sleep.
    function wake() {
      if (!frame && !disposed) { last = performance.now(); frame = root.requestAnimationFrame(tick); }
    }
    function tick(now) {
      frame = 0;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 8), kc = 1 - Math.exp(-dt * 10);
      let moving = false;
      for (const entry of vehicles.values()) {
        const t = entry.target;
        if (!t) continue;
        const dx = t.x - entry.x, dy = t.y - entry.y;
        if (Math.hypot(dx, dy) > 2) { entry.x = t.x; entry.y = t.y; } // jump, don't glide across the plant
        else { entry.x += dx * k; entry.y += dy * k; }
        if (t.yaw !== null) entry.yaw = lerpAngle(entry.yaw, t.yaw, k);
        if (Math.hypot(t.x - entry.x, t.y - entry.y) > 0.002 || (t.yaw !== null && Math.abs(lerpAngle(entry.yaw, t.yaw, 1) - entry.yaw) > 0.002)) moving = true;
        entry.group.position.set(entry.x, 0, -entry.y);
        entry.group.rotation.y = entry.yaw;
      }
      orbit.target.lerp(goal.target, kc);
      orbit.distance += (goal.distance - orbit.distance) * kc;
      orbit.azimuth = lerpAngle(orbit.azimuth, goal.azimuth, kc);
      orbit.tilt += (goal.tilt - orbit.tilt) * kc;
      const settling = orbit.target.distanceTo(goal.target) > 1e-3 || Math.abs(goal.distance - orbit.distance) > 1e-3 ||
        Math.abs(lerpAngle(orbit.azimuth, goal.azimuth, 1) - orbit.azimuth) > 1e-4 || Math.abs(goal.tilt - orbit.tilt) > 1e-4;
      placeCamera();
      renderer.render(scene, camera);
      if (moving || settling) wake();
    }

    function resize() {
      const width = host.clientWidth || 1, height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = width + 'px';
      renderer.domElement.style.height = height + 'px';
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      wake();
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    // Pointer: left-drag rotates, right-drag or Shift+drag pans, wheel zooms,
    // a click on a vehicle selects it.
    const canvas = renderer.domElement;
    let drag = null;
    // The 2D map listens on the container; keep 3D gestures to the canvas.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'click', 'dblclick']) {
      canvas.addEventListener(type, event => event.stopPropagation());
    }
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      canvas.setPointerCapture(event.pointerId);
      drag = {x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey, moved: 0};
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.x = event.clientX; drag.y = event.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.pan) {
        const scale = (2 * goal.distance * Math.tan((camera.fov * Math.PI) / 360)) / (host.clientHeight || 1);
        const right = new THREE.Vector3(Math.cos(goal.azimuth), 0, -Math.sin(goal.azimuth));
        const forward = new THREE.Vector3(-Math.sin(goal.azimuth), 0, -Math.cos(goal.azimuth));
        goal.target.addScaledVector(right, -dx * scale).addScaledVector(forward, dy * scale / Math.max(0.35, Math.cos(goal.tilt)));
      } else {
        goal.azimuth -= dx * 0.006;
        goal.tilt = Math.min(1.35, Math.max(0, goal.tilt - dy * 0.005));
      }
      orbit.target.copy(goal.target); orbit.azimuth = goal.azimuth; orbit.tilt = goal.tilt;
      wake();
    });
    const release = event => {
      if (drag && drag.moved < 4 && event.button === 0) pick(event);
      drag = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      goal.distance = Math.min(200, Math.max(1.2, goal.distance * Math.exp(event.deltaY * 0.0012)));
      wake();
    }, {passive: false});
    const raycaster = new THREE.Raycaster();
    function pick(event) {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(fleet.children, true).find(h => !(h.object instanceof THREE.Sprite));
      let node = hit?.object;
      while (node && !node.userData.vehicleId) node = node.parent;
      onSelect?.(node?.userData.vehicleId || null);
    }

    function update(next) {
      view = next;
      const layoutNow = layoutKey(view), trafficNow = trafficKey(view);
      if (layoutNow !== layoutSignature) { buildLayout(); layoutSignature = layoutNow; }
      if (trafficNow !== trafficSignature) { buildTraffic(); trafficSignature = trafficNow; }
      syncVehicles();
      if (!fitted && (view.points.length || view.stations.length)) {
        fitted = true; resize(); fit();
        orbit.target.copy(goal.target); orbit.distance = goal.distance; orbit.azimuth = goal.azimuth; orbit.tilt = goal.tilt;
      }
      wake();
    }

    function setSelection(ids = []) {
      for (const [id, entry] of vehicles) {
        const selected = ids.includes(id);
        entry.group.scale.setScalar(selected ? 1.15 : 1);
        entry.group.userData.label.material.opacity = !ids.length || selected ? 1 : 0.55;
      }
      wake();
    }

    function dispose() {
      disposed = true;
      if (frame) root.cancelAnimationFrame(frame);
      observer?.disconnect();
      disposeTree(scene);
      renderer.dispose();
      canvas.remove();
    }

    resize();
    const zoom = factor => { goal.distance = Math.min(200, Math.max(1.2, goal.distance * factor)); wake(); };
    return {update, fit, zoom, top: () => fit(0), oblique: () => fit(0.85), setSelection, dispose};
  }

  const api = {describe, pathLines, bounds, layoutKey, trafficKey, lerpAngle, loadThree, webglAvailable, mount, THREE_SRC};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Map3D = api;
})(globalThis);
