(function (root) {
  'use strict';
  const G = root.SceneFloorplanGeometry;
  const endpoint = 'map-workspace/scene-floorplans';
  const limit = 5 * 1024 * 1024;
  const roundPixel = n => Math.round(n * 1000) / 1000;

  function mount(container, { api, controller, getCanvas, onUpdate, prepareEdit }) {
    let draft = null, picking = null, file = null, previewUrl = null;
    let loaded = null, loading = null, failed = null;
    let busy = false, visible = true, opacity = .65, error = '', status = '';
    let authScope = null;
    const authorized = () => !!(api.authorized && api.deploymentConfirmed &&
      (!controller.sceneScope || controller.sceneScope === api.scope));
    const disabled = () => controller.busy || !!controller.pending;
    const currentImage = () => {
      if (draft && previewUrl) return previewUrl;
      const plan = controller.scene.floorplan;
      return authorized() && plan && loaded?.id === plan.assetId ? loaded.url : null;
    };

    function refresh() {
      sync();
      if (controller.scene.floorplan && !controller.dirty) status = '';
      ui.render({ floorplan: controller.scene.floorplan, draft, picking, busy, disabled: disabled(),
        authorized: authorized(), visible, opacity, canFit: !!(draft || controller.scene.floorplan),
        error: error || failed?.message || '', status: status || (loading ? '正在读取底图…' : '') });
    }

    function clearPreview() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      draft = picking = file = previewUrl = null;
    }

    function reset() {
      clearPreview();
      error = status = '';
      visible = true;
      opacity = .65;
    }

    function sync() {
      const plan = controller.scene.floorplan;
      const identity = authorized() ? `${api.scope}:${api.keyRevision}` : null;
      const wanted = identity && plan?.assetId ? `${identity}:${plan.assetId}` : null;
      if (identity !== authScope) {
        authScope = identity;
        if (draft?.assetId) clearPreview();
      }
      if (loading && loading.key !== wanted) { loading.abort.abort(); loading = null; }
      if (loaded && loaded.key !== wanted) { URL.revokeObjectURL(loaded.url); loaded = null; }
      if (failed?.key !== wanted) failed = null;
      if (!wanted || loading || loaded || failed) return;
      const context = controller.context();
      const job = { key: wanted, abort: new AbortController() };
      loading = job;
      api.request(`${endpoint}/${plan.assetId}/image.png`, undefined, { signal: job.abort.signal, floorplanImage: true })
        .then(blob => {
          if (loading !== job || !controller.current(context) || !authorized() || controller.scene.floorplan?.assetId !== plan.assetId) return;
          if (blob.type !== 'image/png' || blob.size > limit || !blob.size) throw Error('服务器返回的底图无效。');
          loaded = { key: wanted, id: plan.assetId, url: URL.createObjectURL(blob) };
        }).catch(err => {
          if (loading === job) failed = { key: wanted, message: err.status === 404
            ? '服务器没有找到这个版本的底图。' : '底图未能读取。点“适配底图”可重试。' };
        }).finally(() => {
          if (loading !== job) return;
          loading = null;
          onUpdate();
        });
    }

    function canEdit() {
      if (busy || disabled()) throw Error('请等待读取或保存完成。');
      return prepareEdit();
    }

    async function choose(selected) {
      if (!canEdit()) return;
      if (!/\.(png|jpe?g)$/i.test(selected.name) || !selected.size || selected.size > limit) {
        throw Error('请选择不超过 5 MiB 的 PNG 或 JPG。');
      }
      busy = true;
      error = status = '';
      onUpdate();
      let url;
      try {
        const bytes = new Uint8Array(await selected.slice(0, 8).arrayBuffer());
        const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if ((/\.png$/i.test(selected.name) && !png) || (!/\.png$/i.test(selected.name) && !jpeg)) {
          throw Error('文件内容与 PNG / JPG 格式不符。');
        }
        url = URL.createObjectURL(selected);
        const image = new Image();
        image.src = url;
        try { await image.decode(); } catch (_) { throw Error('无法读取这张平面图。'); }
        const asset = { name: selected.name, width: image.naturalWidth, height: image.naturalHeight };
        if (!G.assetOK(asset, false)) throw Error('底图文件名或尺寸超出支持范围（最多 800 万像素）。');
        clearPreview();
        draft = asset;
        file = selected;
        previewUrl = url;
        url = null;
        visible = true;
        getCanvas().fit(true);
      } finally {
        if (url) URL.revokeObjectURL(url);
        busy = false;
        onUpdate();
      }
    }

    async function apply(plan) {
      if (!draft || !canEdit()) return;
      controller.requireAccess();
      const validation = G.validate(plan, !!draft.assetId);
      if (validation) throw Error(validation);
      busy = true;
      error = status = '';
      picking = null;
      const context = controller.context();
      onUpdate();
      try {
        if (file) {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = () => reject(Error('读取文件失败，请重新选择底图。'));
            reader.readAsDataURL(file);
          });
          if (!controller.current(context) || !authorized()) throw Error('连接已变化，请重新连接后应用底图。');
          const asset = await api.request(endpoint, { imageName: plan.name, imageBase64: data });
          if (!G.assetOK(asset) || asset.name !== plan.name || asset.width !== plan.width || asset.height !== plan.height) {
            throw Error('服务器解码尺寸与预览不一致。请将图纸导出为 PNG 后重试。');
          }
          plan = { ...plan, assetId: asset.assetId };
        }
        if (!controller.current(context) || !authorized()) throw Error('连接已变化，请重新连接后应用底图。');
        controller.change({ ...controller.scene, floorplan: plan });
        controller.sceneScope = context.scope;
        clearPreview();
        visible = true;
        status = '底图已校准。保存场景后，下次打开会恢复。';
        getCanvas().fit();
      } catch (err) {
        if (err.code === 'NETWORK_UNCERTAIN') throw Error('底图上传结果未确认。可再次应用同一张图。');
        throw err;
      } finally {
        busy = false;
        onUpdate();
      }
    }

    function setAnchor(which, point) {
      if (!draft || !G.inside(draft, point)) return;
      draft = { ...draft, [`anchor${which}`]: point };
      picking = null;
      error = '';
      onUpdate();
    }

    const ui = root.SceneFloorplanUI.mount(container, {
      onChoose: choose, onApply: apply, onAnchor: setAnchor,
      onPick(which) {
        if (!draft || !currentImage()) throw Error('请先读取底图，再选择校准点。');
        picking = which;
        error = '';
        onUpdate();
        getCanvas().focus();
      },
      onFit() { failed = null; visible = true; onUpdate(); getCanvas().fit(true); },
      onVisible(value) { visible = value; onUpdate(); },
      onOpacity(value) { opacity = value; onUpdate(); },
      onRecalibrate() {
        if (!canEdit()) return;
        controller.requireAccess();
        draft = { ...controller.scene.floorplan };
        visible = true;
        error = '';
        status = '调整比例或朝向后，请核对原有墙体和路线的位置。';
        onUpdate();
        getCanvas().fit(true);
      },
      onRemove() {
        if (!canEdit()) return;
        const { floorplan, ...scene } = controller.scene;
        controller.change(scene);
        status = '已移除参考底图。可以撤销。';
        onUpdate();
        getCanvas().fit();
      },
      onCancel() { clearPreview(); error = status = ''; onUpdate(); getCanvas().fit(); },
    });

    function projection() {
      if (draft && previewUrl) return { asset: draft, t: G.preview(draft) };
      const plan = controller.scene.floorplan;
      return plan && authorized() && { asset: plan, t: G.transform(plan) };
    }

    function canvasPoint(point) {
      if (!draft || !picking) return !!draft || busy;
      const { t } = projection();
      const pixel = G.toPixel(t, point);
      const anchor = { u: roundPixel(pixel.u), v: roundPixel(pixel.v) };
      if (!G.inside(draft, anchor)) {
        error = '请在平面图范围内点选。';
        onUpdate();
      } else setAnchor(picking, anchor);
      return true;
    }

    function draw(el, svg) {
      const url = currentImage(), projected = projection();
      if (!url || !projected || (!visible && !draft)) return false;
      const { asset, t } = projected;
      svg.append(el('image', { href: url, width: asset.width, height: asset.height,
        transform: `matrix(${t.c} ${t.s} ${-t.s} ${t.c} ${t.x} ${t.y})`,
        opacity: draft ? .95 : opacity, 'pointer-events': 'none', 'data-floorplan-layer': '' }));
      return true;
    }

    function drawAnchors(el, svg, screenScale) {
      if (!draft || !currentImage() || !screenScale) return;
      const { t } = projection();
      const g = el('g', { 'pointer-events': 'none' });
      const a = draft.anchorA && G.toWorld(t, draft.anchorA), b = draft.anchorB && G.toWorld(t, draft.anchorB);
      if (a && b) g.append(el('line', { x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, stroke: '#1d4ed8', 'stroke-width': 2 / screenScale }));
      for (const [label, point] of [['A', a], ['B', b]]) {
        if (!point) continue;
        g.append(el('circle', { cx: point.x, cy: -point.y, r: 8 / screenScale, fill: '#1d4ed8', stroke: '#fff', 'stroke-width': 1.5 / screenScale }));
        g.append(el('text', { x: point.x, y: -point.y, 'font-size': 10 / screenScale, fill: '#fff', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, label));
      }
      svg.append(g);
    }

    return {
      refresh, reset, draw, drawAnchors, canvasPoint,
      bounds() { const p = projection(); return p && (visible || draft) ? G.corners(p.t, p.asset) : []; },
      cancelPick() { if (picking) { picking = null; error = ''; onUpdate(); } },
      hasDraft: () => !!draft,
      isBusy: () => busy,
    };
  }

  root.SceneFloorplanLayer = { mount };
})(globalThis);
