(function (root) {
  'use strict';
  const idOK = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  const inRange = (value, lo, hi) => Number.isFinite(value) && value >= lo && value <= hi;

  function assetOK(asset, requireId = true) {
    return asset && (!requireId || idOK(asset.assetId)) && typeof asset.name === 'string' &&
      Array.from(asset.name).length <= 255 && /\.(png|jpe?g)$/i.test(asset.name) && !/[\x00-\x1f\x7f/\\]/.test(asset.name) &&
      Number.isInteger(asset.width) && inRange(asset.width, 1, 16384) && Number.isInteger(asset.height) &&
      inRange(asset.height, 1, 16384) && asset.width * asset.height <= 8_000_000;
  }

  function inside(asset, pixel) {
    return pixel && Number.isFinite(pixel.u) && Number.isFinite(pixel.v) &&
      pixel.u >= 0 && pixel.u < asset.width && pixel.v >= 0 && pixel.v < asset.height;
  }

  function scaleOf(plan) {
    return plan.distanceM / Math.hypot(plan.anchorB.u - plan.anchorA.u, plan.anchorB.v - plan.anchorA.v);
  }

  function validate(plan, requireId = true) {
    if (!assetOK(plan, requireId)) return '底图文件信息无效。';
    if (!inside(plan, plan.anchorA) || !inside(plan, plan.anchorB)) return '请选择图纸范围内的 A、B 两点。';
    if (!inRange(plan.distanceM, .01, 1000)) return '实际距离须为 0.01 至 1000 米。';
    if (!inRange(plan.origin?.x, -100000, 100000) || !inRange(plan.origin?.y, -100000, 100000) ||
        !inRange(plan.headingDeg, -180, 180)) return '请检查 A 点场地坐标和方向角。';
    const scale = scaleOf(plan);
    if (!inRange(scale, .00001, 100) || scale * plan.width > 2000 || scale * plan.height > 2000) {
      return '两点过近或图纸范围过大，请核对实际距离并选取间隔较远的点。';
    }
    return '';
  }

  function transform(plan) {
    const a = plan.anchorA, b = plan.anchorB, scale = scaleOf(plan);
    // SVG Y increases downward. Rotate the image-space segment onto the negative world heading.
    const angle = -plan.headingDeg * Math.PI / 180 - Math.atan2(b.v - a.v, b.u - a.u);
    const c = scale * Math.cos(angle), s = scale * Math.sin(angle);
    return {
      c, s, x: plan.origin.x - c * a.u + s * a.v,
      y: -plan.origin.y - s * a.u - c * a.v,
    };
  }

  function preview(asset) {
    const scale = 14 / Math.max(asset.width, asset.height);
    return { c: scale, s: 0, x: 0, y: -asset.height * scale };
  }

  function toWorld(t, { u, v }) {
    return { x: t.c * u - t.s * v + t.x, y: -(t.s * u + t.c * v + t.y) };
  }

  function toPixel(t, { x, y }) {
    const dx = x - t.x, dy = -y - t.y, norm = t.c * t.c + t.s * t.s;
    return { u: (t.c * dx + t.s * dy) / norm, v: (-t.s * dx + t.c * dy) / norm };
  }

  function corners(t, { width, height }) {
    return [{ u: 0, v: 0 }, { u: width, v: 0 }, { u: width, v: height }, { u: 0, v: height }]
      .map(pixel => toWorld(t, pixel));
  }

  const api = { assetOK, inside, validate, transform, preview, toWorld, toPixel, corners };
  root.SceneFloorplanGeometry = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
