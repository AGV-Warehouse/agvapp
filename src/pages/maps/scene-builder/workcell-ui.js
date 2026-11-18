(function (root) {
  'use strict';

  const model = root.SceneWorkcellModel || (typeof require === 'function' ? require('./workcell-model.js') : null);
  const templates = [['parking', '普通停车位'], ...Object.entries(model.labels)];
  const footprintFields = [
    ['footprintX', '中心 X（m）', 'min="-100000" max="100000"'],
    ['footprintY', '中心 Y（m）', 'min="-100000" max="100000"'],
    ['footprintYaw', '朝向（°）', 'min="-180" max="180"'],
    ['width', '宽度（m）', 'min="0.1" max="20"'],
    ['depth', '深度（m）', 'min="0.1" max="20"'],
  ];
  const tableFields = [
    ['clearHeight', '桌底净高（m）', 'min="0.05" max="10"'],
    ['topThickness', '桌面厚度（m）', 'min="0.01" max="1"'],
    ['legWidth', '桌腿宽度（m）', 'min="0.01" max="2"'],
  ];
  const terminalFields = [
    ['terminalX', '立牌 X（m）', 'min="-100000" max="100000"'],
    ['terminalY', '立牌 Y（m）', 'min="-100000" max="100000"'],
    ['terminalYaw', '立牌正面朝向（°）', 'min="-180" max="180"'],
    ['terminalHeight', '标识中心高度（m）', 'min="0.05" max="5"'],
    ['tagId', 'ArUco Tag 编号', 'min="0" max="49"', '1'],
  ];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const degrees = radians => radians * 180 / Math.PI;
  const radians = angle => angle / 180 * Math.PI;

  function makeDraft(station, point) {
    const { workcell } = station;
    const footprint = workcell?.footprint;
    const table = workcell?.table;
    const terminal = workcell?.terminal;
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      templateId: workcell?.templateId ?? 'parking',
      terminalEnabled: !!terminal,
      footprintX: footprint?.x ?? x,
      footprintY: footprint?.y ?? y,
      footprintYaw: degrees(footprint?.yaw ?? station.yaw ?? 0),
      width: footprint?.width ?? 1.6,
      depth: footprint?.depth ?? 1.6,
      clearHeight: table?.clearHeight ?? 0.8,
      topThickness: table?.topThickness ?? 0.08,
      legWidth: table?.legWidth ?? 0.08,
      terminalX: terminal?.x ?? x + 1.2,
      terminalY: terminal?.y ?? y,
      terminalYaw: degrees(terminal?.yaw ?? station.yaw ?? 0),
      terminalHeight: terminal?.height ?? 1.1,
      tagId: terminal?.tagId ?? '',
      buttonId: terminal?.buttonId ?? '',
    };
  }

  function readDraft(draft) {
    if (draft.templateId === 'parking') return null;
    function number(key, label) {
      const value = Number(draft[key]);
      if (String(draft[key]).trim() === '' || !Number.isFinite(value)) {
        throw new Error(`请填写${label}。`);
      }
      return value;
    }
    const workcell = {
      templateId: draft.templateId,
      footprint: {
        x: number('footprintX', '占地区域中心 X'),
        y: number('footprintY', '占地区域中心 Y'),
        yaw: radians(number('footprintYaw', '占地区域朝向')),
        width: number('width', '宽度'),
        depth: number('depth', '深度'),
      },
    };
    if (draft.templateId === 'lift-table-v1') {
      workcell.table = {
        clearHeight: number('clearHeight', '桌底净高'),
        topThickness: number('topThickness', '桌面厚度'),
        legWidth: number('legWidth', '桌腿宽度'),
      };
    }
    if (draft.terminalEnabled) {
      workcell.terminal = {
        x: number('terminalX', '立牌 X'),
        y: number('terminalY', '立牌 Y'),
        yaw: radians(number('terminalYaw', '立牌朝向')),
        height: number('terminalHeight', '立牌安装高度'),
        tagId: number('tagId', 'ArUco Tag 编号'),
        buttonId: draft.buttonId,
      };
    }
    const error = model.validate(workcell);
    if (error) throw new Error(error);
    return workcell;
  }

  function mount(container, { getScene, getSelection, isDisabled, onChange, onStatus, onPlace }) {
    let committedKey;
    let renderedKey;
    let draft;
    let baseline;

    function hasUnapplied() {
      if (!draft) return false;
      if (draft.templateId !== baseline.templateId) return true;
      if (draft.templateId === 'parking') return false;
      if (draft.terminalEnabled !== baseline.terminalEnabled) return true;
      const fields = [...footprintFields];
      if (draft.templateId === 'lift-table-v1') fields.push(...tableFields);
      if (draft.terminalEnabled) fields.push(...terminalFields, ['buttonId']);
      return fields.some(([name]) => String(draft[name]) !== String(baseline[name]));
    }

    function discard() {
      committedKey = renderedKey = undefined;
      render();
    }

    function updateDiscardButton() {
      const button = container.querySelector('[data-workcell-discard]');
      if (button) button.hidden = !hasUnapplied();
    }

    function setPosition(which, { x, y }) {
      render();
      if (isDisabled?.() || !draft || draft.templateId === 'parking') return false;
      if (which !== 'footprint' && (which !== 'terminal' || !draft.terminalEnabled)) return false;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      for (const [axis, value] of [['X', x], ['Y', y]]) {
        const name = which + axis;
        draft[name] = value;
        container.querySelector(`[data-workcell-form] [name="${name}"]`).value = value;
      }
      updateDiscardButton();
      return true;
    }

    function render() {
      const selection = getSelection();
      const navigation = getScene()?.navigation;
      const station = selection?.kind === 'station'
        ? navigation?.stations?.find(item => item.id === selection.id)
        : null;
      if (!station) {
        if (renderedKey !== undefined) container.replaceChildren();
        committedKey = renderedKey = draft = baseline = undefined;
        return;
      }
      const key = JSON.stringify([station.id, station.workcell ?? null]);
      if (key !== committedKey || !hasUnapplied()) {
        const point = navigation.points?.find(item => item.id === station.pointId);
        baseline = makeDraft(station, point);
        draft = { ...baseline };
        committedKey = key;
      }
      const disabled = !!isDisabled?.();
      const viewKey = JSON.stringify([key, station.name, baseline, disabled, draft.templateId, draft.terminalEnabled]);
      if (viewKey === renderedKey && container.querySelector('[data-workcell-form]')) return;
      renderedKey = viewKey;

      const fields = group => group.map(([name, label, bounds = '', step = 'any']) =>
        `<label>${label}<input name="${name}" type="number" step="${step}" ${bounds} value="${escape(draft[name])}" required></label>`
      ).join('');
      const isParking = draft.templateId === 'parking';
      const isTable = draft.templateId === 'lift-table-v1';
      container.innerHTML = `
        <section class="scene-workcell" data-workcell-editor>
          <h3>工位规划</h3>
          <p><strong>${escape(station.name)}</strong></p>
          <p>${isParking ? '为这个停车点选用缓冲位或高桌载台。' : '预填尺寸供布置参考，请按实际测量调整。高桌会生成桌腿与桌面，保存后可检查导航净空；搬运与顶升动作尚未接入。'}</p>
          <form data-workcell-form novalidate>
            <fieldset ${disabled ? 'disabled' : ''}>
              <legend>工位设置</legend>
              <label>工位类型
                <select name="templateId" data-workcell-template>
                  ${templates.map(([id, label]) => `<option value="${id}" ${draft.templateId === id ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
              </label>
              ${isParking ? '' : `
                <fieldset>
                  <legend>${isTable ? '高桌占地' : '缓冲位范围'}</legend>
                  <div class="scene-workcell-fields">${fields(footprintFields)}</div>
                  ${onPlace ? `<button class="button" type="button" data-workcell-place="footprint">在图上定位${isTable ? '高桌' : '缓冲位'}</button>` : ''}
                </fieldset>
                ${isTable ? `
                  <fieldset>
                    <legend>高桌尺寸</legend>
                    <div class="scene-workcell-fields">${fields(tableFields)}</div>
                  </fieldset>` : ''}
                <label><input type="checkbox" name="terminalEnabled" data-workcell-terminal ${draft.terminalEnabled ? 'checked' : ''}>规划交互立牌</label>
                ${draft.terminalEnabled ? `
                  <fieldset>
                    <legend>立牌位置与标识</legend>
                    <p>请放在工位侧边，避开停车点和路线。立牌会生成底座、立柱、面板与 ArUco 标识，底座占地 0.36 × 0.42 m，标识边长 0.20 m。标识中心高度至少 0.21 m；正面朝向 0° 指向场地 +X，90° 指向 +Y。编号范围 0–49（DICT_4X4_50）。视觉识别和实体按钮尚未接入。</p>
                    <div class="scene-workcell-fields">
                      ${fields(terminalFields)}
                      <label>按钮编号<input name="buttonId" value="${escape(draft.buttonId)}" maxlength="64" required aria-describedby="workcell-button-id-hint"></label>
                    </div>
                    ${onPlace ? '<button class="button" type="button" data-workcell-place="terminal">在图上定位立牌</button>' : ''}
                    <p id="workcell-button-id-hint">按钮编号须以英文字母或数字开头，可用字母、数字、点、下划线和连字符。</p>
                  </fieldset>` : ''}
              `}
              <button class="button button-primary" type="submit" data-workcell-apply>应用工位规划</button>
              <button class="button" type="button" data-workcell-discard ${hasUnapplied() ? '' : 'hidden'}>放弃未应用修改</button>
              <p data-workcell-error role="alert" hidden></p>
            </fieldset>
          </form>
        </section>`;
      const form = container.querySelector('[data-workcell-form]');
      form.querySelector('[data-workcell-discard]').addEventListener('click', () => {
        discard();
        onStatus?.('已放弃未应用的工位修改。');
        container.querySelector('[data-workcell-template]')?.focus();
      });
      for (const button of form.querySelectorAll('[data-workcell-place]')) {
        button.addEventListener('click', () => {
          if (!isDisabled?.()) onPlace(button.dataset.workcellPlace);
        });
      }
      form.addEventListener('input', event => {
        const { name, type, value } = event.target;
        if (!Object.hasOwn(draft, name) || type === 'checkbox' || name === 'templateId') return;
        draft[name] = value;
        updateDiscardButton();
      });
      form.addEventListener('change', event => {
        const { name, value, checked } = event.target;
        if (name === 'templateId') {
          draft.templateId = value;
          render();
          container.querySelector('[data-workcell-template]')?.focus();
        } else if (name === 'terminalEnabled') {
          draft.terminalEnabled = checked;
          render();
          container.querySelector('[data-workcell-terminal]')?.focus();
        }
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const current = getSelection();
        if (isDisabled?.() || current?.kind !== 'station' || current.id !== station.id) return;
        const error = form.querySelector('[data-workcell-error]');
        error.hidden = true;
        try {
          onChange(readDraft(draft));
        } catch (failure) {
          error.textContent = failure.message;
          error.hidden = false;
          onStatus?.(failure.message, true);
          return;
        }
        onStatus?.('已应用工位规划，请保存场景。');
        render();
      });
    }

    render();
    return { render, hasUnapplied, discard, setPosition };
  }

  const api = { mount };
  root.SceneWorkcellUI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
