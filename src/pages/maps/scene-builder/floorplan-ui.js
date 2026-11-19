(function(root){
'use strict';

function mount(container, options = {}) {
  container.innerHTML = `
    <section class="scene-floorplan">
      <h2>参考底图</h2>
      <p data-floorplan-empty>导入平面图，在画布上按实际距离标定。</p>
      <p data-floorplan-name hidden></p>
      <fieldset class="scene-floorplan-actions" aria-label="底图操作">
        <input data-floorplan-file type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden>
        <button type="button" class="button" data-floorplan-choose>导入 PNG / JPG</button>
        <button type="button" class="button" data-floorplan-fit hidden>适配底图</button>
        <div data-floorplan-view hidden>
          <label><input type="checkbox" data-floorplan-visible> 显示底图</label>
          <label>不透明度 <output data-floorplan-percent></output>
            <input type="range" min="0" max="100" step="1" data-floorplan-opacity>
          </label>
          <div class="scene-floorplan-actions">
            <button type="button" class="button" data-floorplan-recalibrate>重新标定</button>
            <button type="button" class="button" data-floorplan-remove>移除底图</button>
          </div>
        </div>
      </fieldset>
      <p data-floorplan-status role="status" hidden></p>
      <p data-floorplan-error role="alert" hidden></p>
      <form data-floorplan-form novalidate hidden>
        <fieldset class="scene-floorplan-fields">
          <legend>标定底图</legend>
          <div class="scene-floorplan-actions">
            <button type="button" class="button" data-floorplan-pick-a aria-pressed="false">选取 A 点</button>
            <button type="button" class="button" data-floorplan-pick-b aria-pressed="false">选取 B 点</button>
          </div>
          <p data-floorplan-prompt aria-live="polite"></p>
          <label>A 到 B 的实际距离（m）
            <input type="number" step="any" required name="distanceM" data-floorplan-distance>
          </label>
          <details>
            <summary>像素坐标和场地定位</summary>
            <p>从图片左上角起，水平坐标向右，垂直坐标向下。</p>
            <div class="scene-field-pair">
              <label>A 点水平（px）<input type="number" step="any" data-floorplan-a-u></label>
              <label>A 点垂直（px）<input type="number" step="any" data-floorplan-a-v></label>
            </div>
            <div class="scene-field-pair">
              <label>B 点水平（px）<input type="number" step="any" data-floorplan-b-u></label>
              <label>B 点垂直（px）<input type="number" step="any" data-floorplan-b-v></label>
            </div>
            <div class="scene-field-pair">
              <label>A 点场地 X（m）<input type="number" step="any" data-floorplan-origin-x placeholder="0"></label>
              <label>A 点场地 Y（m）<input type="number" step="any" data-floorplan-origin-y placeholder="0"></label>
            </div>
            <label>A → B 的场地方向（°，从 +X 逆时针）
              <input type="number" step="any" data-floorplan-heading placeholder="0">
            </label>
          </details>
          <p data-floorplan-connect hidden>请连接草稿库后应用标定。</p>
          <div class="scene-floorplan-actions">
            <button type="submit" class="button button-primary" data-floorplan-apply>应用标定</button>
            <button type="button" class="button" data-floorplan-cancel>取消标定</button>
          </div>
        </fieldset>
      </form>
    </section>`;
  const find = name => container.querySelector(`[data-floorplan-${name}]`);
  const fields = {
    A: {u:find('a-u'), v:find('a-v')},
    B: {u:find('b-u'), v:find('b-v')}
  };
  const actions = container.querySelector('.scene-floorplan-actions');
  const form = find('form');
  const details = form.querySelector('details');
  const file = find('file');
  const distance = find('distance');
  const originX = find('origin-x');
  const originY = find('origin-y');
  const heading = find('heading');
  const opacity = find('opacity');
  let state = {};
  let draftKey = null;
  let anchorKeys = {A:null, B:null};
  let localError = '';

  function describe(name, text) {
    const element = find(name);
    const setIfChanged = root.PortalI18n?.setIfChanged;
    if (setIfChanged) setIfChanged(element, 'textContent', text);
    else if (element.textContent !== text) element.textContent = text;
    element.hidden = !text;
  }

  function showError() {
    describe('error', localError || state.error || '');
  }

  function invoke(callback, ...args) {
    localError = '';
    showError();
    const report = error => {
      localError = error?.message || '底图操作失败，请重试。';
      showError();
    };
    try {
      const result = callback?.(...args);
      if (result?.catch) result.catch(report);
    } catch (error) {
      report(error);
    }
  }

  function render(next = options.getState?.() || {}) {
    state = next;
    const {draft, floorplan, picking, busy, disabled, authorized, visible, canFit} = state;
    const asset = draft || floorplan;
    const blocked = busy || disabled;
    const requiresConnection = !!draft && !draft.assetId && authorized === false;
    const nextKey = draft ? JSON.stringify([draft.assetId, draft.name, draft.width, draft.height]) : null;
    if (nextKey !== draftKey) {
      draftKey = nextKey;
      anchorKeys = {A:null, B:null};
      localError = '';
      distance.value = draft?.distanceM ?? '';
      originX.value = draft?.origin?.x ?? '';
      originY.value = draft?.origin?.y ?? '';
      heading.value = draft?.headingDeg ?? '';
      details.open = false;
      for (const {u,v} of Object.values(fields)) u.value = v.value = '';
    }
    for (const point of ['A', 'B']) {
      const anchor = draft?.[`anchor${point}`];
      const key = anchor ? JSON.stringify([anchor.u, anchor.v]) : null;
      if (key !== anchorKeys[point]) {
        anchorKeys[point] = key;
        fields[point].u.value = anchor?.u ?? '';
        fields[point].v.value = anchor?.v ?? '';
      }
      const pick = find(`pick-${point.toLowerCase()}`);
      pick.setAttribute('aria-pressed', String(picking === point));
      pick.textContent = anchor ? `重选 ${point} 点` : `选取 ${point} 点`;
    }
    find('empty').hidden = !!asset;
    describe('name', asset ? `${asset.name} · ${asset.width} × ${asset.height} px` : '');
    describe('status', state.status || (busy ? '正在处理底图…' : ''));
    showError();
    actions.disabled = !!blocked;
    find('choose').hidden = !!draft;
    find('choose').textContent = floorplan ? '更换底图' : '导入 PNG / JPG';
    find('fit').hidden = !asset;
    find('fit').disabled = canFit === false;
    find('view').hidden = !floorplan || !!draft;
    find('visible').checked = visible !== false;
    const percent = Math.round((state.opacity ?? 1) * 100);
    if (opacity.valueAsNumber !== percent) opacity.value = percent;
    find('percent').textContent = `${percent}%`;
    form.hidden = !draft;
    form.querySelector('fieldset').disabled = !!blocked;
    find('apply').disabled = requiresConnection;
    find('connect').hidden = !requiresConnection;
    const pointStatus = draft?.anchorA && draft?.anchorB
      ? '两点已选，填写实际距离后应用标定。'
      : draft?.anchorA ? '已选 A 点，请选取 B 点。'
      : draft?.anchorB ? '已选 B 点，请选取 A 点。' : '请选择一段已知长度的两个端点。';
    describe('prompt', picking ? `请在画布的底图上点击 ${picking} 点。` : pointStatus);
  }

  function pixel(point) {
    return {u:fields[point].u.valueAsNumber, v:fields[point].v.valueAsNumber};
  }

  function validPixel({u,v}, asset) {
    return Number.isFinite(u) && Number.isFinite(v) && u >= 0 && v >= 0 && u <= asset.width && v <= asset.height;
  }

  for (const [name, callback] of [
    ['fit', options.onFit], ['remove', options.onRemove], ['recalibrate', options.onRecalibrate], ['cancel', options.onCancel]
  ]) {
    find(name).addEventListener('click', () => invoke(callback));
  }
  find('choose').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    file.value = '';
    if (selected) invoke(options.onChoose, selected);
  });
  find('visible').addEventListener('change', event => invoke(options.onVisible, event.currentTarget.checked));
  opacity.addEventListener('input', () => invoke(options.onOpacity, opacity.valueAsNumber / 100));
  for (const point of ['A','B']) {
    find(`pick-${point.toLowerCase()}`).addEventListener('click', () => invoke(options.onPick, point));
    for (const field of Object.values(fields[point])) {
      field.addEventListener('change', () => {
        const anchor = pixel(point);
        if (state.draft && validPixel(anchor, state.draft)) invoke(options.onAnchor, point, anchor);
      });
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const {draft, busy, disabled, authorized} = state;
    if (!draft || busy || disabled || (!draft.assetId && authorized === false)) return;
    invoke(() => {
      const anchorA = pixel('A');
      const anchorB = pixel('B');
      if (!validPixel(anchorA, draft) || !validPixel(anchorB, draft)) {
        details.open = true;
        throw Error('请选取底图内的 A 点和 B 点，或填写两点的像素坐标。');
      }
      if (anchorA.u === anchorB.u && anchorA.v === anchorB.v) throw Error('A 点和 B 点需要位于不同位置。');
      const distanceM = distance.valueAsNumber;
      if (!Number.isFinite(distanceM) || distanceM <= 0) throw Error('实际距离需要大于 0 米。');
      if ([originX, originY, heading].some(field => field.validity.badInput)) {
        details.open = true;
        throw Error('请核对 A 点的场地坐标和 A → B 的场地方向。');
      }
      const {assetId, name, width, height} = draft;
      return options.onApply?.({
        ...(assetId ? {assetId} : {}), name, width, height, anchorA, anchorB, distanceM,
        origin:{x:originX.valueAsNumber || 0, y:originY.valueAsNumber || 0},
        headingDeg:heading.valueAsNumber || 0
      });
    });
  });

  render();
  return {render};
}

const api = {mount};
root.SceneFloorplanUI = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
