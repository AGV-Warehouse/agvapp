(function (root) {
  'use strict';
  const labels = { 'buffer-v1': '缓冲位', 'lift-table-v1': '高桌载台' };
  const inRange = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
  const pose = value => value && inRange(value.x, -100000, 100000) &&
    inRange(value.y, -100000, 100000) && inRange(value.yaw, -Math.PI, Math.PI);
  const list = scene => Array.isArray(scene?.navigation?.stations) ? scene.navigation.stations.filter(station => station?.workcell) : [];

  function validate(plan) {
    if (!only(plan, ['templateId', 'footprint', 'table', 'terminal']) || !Object.hasOwn(labels, plan.templateId)) {
      return '工位模板无效。';
    }
    const { footprint, table, terminal } = plan;
    if (!only(footprint, ['x', 'y', 'yaw', 'width', 'depth']) || !pose(footprint) ||
        !inRange(footprint.width, .1, 20) || !inRange(footprint.depth, .1, 20)) {
      return '请核对工位位置、方向和尺寸，长宽须在 0.1 至 20 米之间。';
    }
    if (plan.templateId === 'lift-table-v1') {
      if (!only(table, ['clearHeight', 'topThickness', 'legWidth']) || !inRange(table.clearHeight, .05, 10) ||
          !inRange(table.topThickness, .01, 1) || !inRange(table.legWidth, .01, 2) ||
          2 * table.legWidth >= Math.min(footprint.width, footprint.depth)) {
        return '请核对桌底净高、桌面厚度和桌腿宽度，桌腿之间需留出空间。';
      }
    } else if (table !== undefined) return '缓冲位不包含高桌尺寸。';
    if (terminal !== undefined && (!only(terminal, ['x', 'y', 'yaw', 'height', 'tagId', 'buttonId']) || !pose(terminal) ||
        !inRange(terminal.height, .05, 5) || !Number.isInteger(terminal.tagId) || !inRange(terminal.tagId, 0, 49) ||
        typeof terminal.buttonId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}(?![\s\S])/.test(terminal.buttonId))) {
      return '请核对立牌位置、安装高度、Tag 编号和按钮编号。';
    }
    return '';
  }

  function corners(box) {
    const c = Math.cos(box.yaw), s = Math.sin(box.yaw), w = box.width / 2, d = box.depth / 2;
    return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => ({
      x: box.x + c * x - s * y, y: box.y + s * x + c * y,
    }));
  }

  const terminalBox = terminal => ({ ...terminal, width: .36, depth: .42 });

  function bounds(scene) {
    return list(scene).flatMap(({ workcell: plan }) => [
      ...corners(plan.footprint), ...(plan.terminal ? corners(terminalBox(plan.terminal)) : []),
    ]);
  }

  function outside(scene) {
    const site = scene?.site;
    if (!site) return [];
    const off = p => p.x < site.x || p.x > site.x + site.width || p.y < site.y || p.y > site.y + site.depth;
    return list(scene).flatMap(({ name, workcell: plan }) => [
      ...(corners(plan.footprint).some(off) ? [`「${name}」的${labels[plan.templateId]}超出场地`] : []),
      ...(plan.terminal && corners(terminalBox(plan.terminal)).some(off) ? [`「${name}」的立牌超出场地`] : []),
    ]);
  }

  function hitAt(scene, point, terminalRadius = 0) {
    const inTerminal = t => {const dx=point.x-t.x,dy=point.y-t.y,c=Math.cos(t.yaw),s=Math.sin(t.yaw);return Math.abs(c*dx+s*dy)<=.18 && Math.abs(-s*dx+c*dy)<=.21;};
    for (const station of list(scene).reverse()) {
      const { footprint: box, terminal } = station.workcell;
      const dx = point.x - box.x, dy = point.y - box.y, c = Math.cos(box.yaw), s = Math.sin(box.yaw);
      if ((terminal && (inTerminal(terminal)||Math.hypot(point.x - terminal.x, point.y - terminal.y) <= terminalRadius)) ||
          (Math.abs(c * dx + s * dy) <= box.width / 2 && Math.abs(-s * dx + c * dy) <= box.depth / 2)) {
        return { kind: 'workcell', id: station.id };
      }
    }
    return null;
  }

  function overlaySVG(scene, scale, selectedId = null, interactive = false) {
    const unit = 1 / Math.max(scale, .00001);
    const transform = p => `translate(${p.x} ${-p.y}) rotate(${-p.yaw * 180 / Math.PI})`;
    return list(scene).map(({ id, name, workcell: plan }) => {
      if (validate(plan)) return '';
      const { footprint: box, table, terminal } = plan, w = box.width / 2, d = box.depth / 2;
      const color = id === selectedId ? '#8b4b16' : table ? '#6744a2' : '#177877';
      const a11y = interactive ? ` data-object-kind="workcell" data-object-id="${esc(id)}" role="img" aria-label="${esc(name)} · ${labels[plan.templateId]}布置"` : '';
      const legs = table ? [-w, w - table.legWidth].flatMap(x => [-d, d - table.legWidth].map(y =>
        `<rect x="${x}" y="${y}" width="${table.legWidth}" height="${table.legWidth}" fill="${color}"/>`)).join('') : '';
      const stand = terminal ? `<g transform="${transform(terminal)}"><rect x="-.18" y="-.21" width=".36" height=".42" fill="#ad611d" fill-opacity=".45" stroke="#ad611d" stroke-width="${unit}"/><path d="M .18 0 H ${.18+14*unit} l ${-4*unit} ${-4*unit} m ${4*unit} ${4*unit} l ${-4*unit} ${4*unit}" fill="none" stroke="#ad611d" stroke-width="${1.5*unit}"/><text x=".22" y="${-6*unit}" font-size="${11*unit}" fill="#814713">Tag ${terminal.tagId}</text></g>` : '';
      return `<g${a11y} data-workcell-overlay="${esc(plan.templateId)}"><title>${esc(name)} · ${labels[plan.templateId]}布置${terminal ? ' · Tag／按钮立牌' : ''}</title><g transform="${transform(box)}"><rect x="${-w}" y="${-d}" width="${box.width}" height="${box.depth}" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="${1.5 * unit}" stroke-dasharray="${4 * unit} ${3 * unit}"/>${legs}</g>${stand}</g>`;
    }).join('');
  }

  const api = { terminalBox, labels, list, validate, bounds, outside, hitAt, overlaySVG };
  root.SceneWorkcellModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
