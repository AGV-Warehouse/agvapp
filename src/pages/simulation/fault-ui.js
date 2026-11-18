// Simulation fault panel: per-robot e-stop, protective-field violation and battery.
//
// SIM only. The panel shows two things separately for every robot: what the
// operator asked for, and what the robot's simulated safety node actually
// reported. Until they match, the robot is shown as "waiting for the robot".
(function (root) {
  'use strict';

  const escapeHTML = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );

  const DEFAULT_BATTERY = 95;
  const POLL_MS = 2000;
  const MESSAGES = {
    SIM_FAULT_SCOPE: '当前环境不支持故障注入。',
    SIM_FAULT_NO_RUNTIME: '仿真尚未运行，无法注入故障。',
    SIM_FAULT_ROBOT: '该车辆不在当前仿真中。',
    SIM_FAULT_UNCERTAIN: '仿真未确认故障请求；请刷新查看车辆实际状态后再重试。',
    SIM_FAULT_ID_CONFLICT: '请求编号冲突，请重试。',
    SIM_FAULT_EMPTY: '请选择要改变的故障。',
    OPERATION_DENIED: '故障注入需要操作员权限。',
  };

  function batteryText(value) {
    return value === null || value === undefined ? `${DEFAULT_BATTERY}%（默认）` : `${value}%`;
  }

  // One robot's badges, from the state the robot actually reported.
  function badges(robot) {
    const applied = robot.applied;
    if (!applied) {
      return '<span class="fault-badge fault-unknown">车辆状态未知</span>';
    }
    const items = [];
    if (applied.eStop) items.push('<span class="fault-badge fault-stop">仿真急停中</span>');
    if (applied.fieldViolation) {
      items.push('<span class="fault-badge fault-stop">安全区域侵入</span>');
    }
    if (applied.batteryPercent !== null && applied.batteryPercent !== undefined) {
      items.push(`<span class="fault-badge fault-charge">电量 ${escapeHTML(applied.batteryPercent)}%</span>`);
    }
    if (!items.length) items.push('<span class="fault-badge fault-ok">正常</span>');
    if (!robot.confirmed && robot.requested) {
      items.push('<span class="fault-badge fault-waiting">等待车辆确认</span>');
    }
    return items.join(' ');
  }

  function robotCard(robot, canWrite) {
    const requested = robot.requested || { eStop: false, fieldViolation: false, batteryPercent: null };
    const disabled = canWrite ? '' : 'disabled';
    const id = escapeHTML(robot.robotId);
    const estopButton = requested.eStop
      ? `<button type="button" class="button" data-fault-robot="${id}" data-fault-set="eStop" data-fault-value="false" ${disabled}>解除急停</button>`
      : `<button type="button" class="button button-danger" data-fault-robot="${id}" data-fault-set="eStop" data-fault-value="true" ${disabled}>仿真急停</button>`;
    const fieldButton = requested.fieldViolation
      ? `<button type="button" class="button" data-fault-robot="${id}" data-fault-set="fieldViolation" data-fault-value="false" ${disabled}>清除区域侵入</button>`
      : `<button type="button" class="button" data-fault-robot="${id}" data-fault-set="fieldViolation" data-fault-value="true" ${disabled}>模拟区域侵入</button>`;
    return `
      <article class="fault-robot" data-fault-card="${id}">
        <header>
          <h4>${escapeHTML(robot.vehicleName)}</h4>
          <div class="fault-badges">${badges(robot)}</div>
        </header>
        <div class="fault-actions">
          ${estopButton}
          ${fieldButton}
        </div>
        <form class="fault-battery" data-fault-battery="${id}">
          <label>电量 %
            <input type="number" min="0" max="100" step="1" name="battery"
              value="${escapeHTML(requested.batteryPercent ?? '')}" placeholder="${DEFAULT_BATTERY}" ${disabled}>
          </label>
          <button type="submit" class="button" ${disabled}>设置电量</button>
          <button type="button" class="button" data-fault-robot="${id}" data-fault-set="batteryPercent" data-fault-value="null" ${disabled}>恢复默认</button>
          <small>当前请求：${escapeHTML(batteryText(requested.batteryPercent))}</small>
        </form>
      </article>`;
  }

  function historyList(history) {
    if (!history?.length) return '<p class="fault-history-empty">尚无故障记录。</p>';
    const items = history.slice(0, 8).map((entry) => {
      const parts = Object.entries(entry.changes || {}).map(([key, value]) => {
        if (key === 'eStop') return value ? '急停' : '解除急停';
        if (key === 'fieldViolation') return value ? '区域侵入' : '清除区域侵入';
        if (key === 'batteryPercent') return `电量 ${batteryText(value)}`;
        return key;
      });
      return `<li><time>${escapeHTML(entry.recordedAt)}</time> ${escapeHTML(entry.vehicleName)}：${escapeHTML(parts.join('、'))}</li>`;
    });
    return `<ol class="fault-history">${items.join('')}</ol>`;
  }

  function catalogNotes(catalog) {
    if (!catalog?.length) return '';
    const items = catalog.map(
      (item) => `<li><strong>${escapeHTML(item.label)}</strong>：${escapeHTML(item.effect)}</li>`,
    );
    return `<details class="fault-notes"><summary>每种故障的真实效果</summary><ul>${items.join('')}</ul></details>`;
  }

  function view(state, options) {
    if (!state) return `<p>${escapeHTML(options.error || '正在读取故障状态…')}</p>`;
    const cards = state.robots.map((robot) => robotCard(robot, options.canWrite)).join('');
    const workerNote = state.workerError
      ? '<p class="fault-warning">仿真当前未返回车辆状态；显示的是已提交请求，车辆是否执行未知。</p>'
      : '';
    const readOnly = options.canWrite ? '' : '<p class="fault-warning">只读：需要操作员会话才能注入故障。</p>';
    return `
      <p class="fault-intro">只用于仿真。急停与区域侵入使用与实车相同的安全信号；订单不会被撤销，解除后车辆继续。</p>
      ${readOnly}${workerNote}
      ${options.error ? `<p class="fault-error" role="alert">${escapeHTML(options.error)}</p>` : ''}
      <div class="fault-robots">${cards}</div>
      ${catalogNotes(state.catalog)}
      <h4>最近记录</h4>
      ${historyList(state.history)}`;
  }

  function parseValue(text) {
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    throw new Error('unexpected fault value');
  }

  function mount(container, api, options = {}) {
    let state = null;
    let error = '';
    let busy = false;
    let visible = options.initialVisible === true;
    let destroyed = false;
    let timer = null;
    let unsupported = false;
    const canWrite = () =>
      api.authorized && api.deploymentConfirmed && api.receiptSnapshot?.().canWrite === true && !busy;

    let lastMarkup = '';
    function render({ fromPoll = false } = {}) {
      if (destroyed) return;
      container.hidden = unsupported;
      options.onSupportChange?.(!unsupported);
      const markup = view(state, { error, canWrite: canWrite() });
      if (markup === lastMarkup) return;
      // Never wipe a battery value the operator is typing because a poll arrived.
      const active = root.document?.activeElement;
      if (fromPoll && active && active.tagName === 'INPUT' && container.contains(active)) return;
      lastMarkup = markup;
      container.innerHTML = markup;
    }

    async function refresh({ fromPoll = false } = {}) {
      if (destroyed || !api.authorized) return;
      try {
        state = await api.request('sim/faults');
        unsupported = false;
        if (!busy) error = '';
      } catch (e) {
        if (e.code === 'SIM_FAULT_SCOPE') {
          unsupported = true;
          state = null;
        } else {
          error = MESSAGES[e.code] || '故障状态尚未读取，请稍后刷新。';
        }
      }
      render({ fromPoll });
    }

    async function send(robotId, changes) {
      if (!canWrite()) return;
      busy = true;
      error = '';
      render();
      try {
        await api.request('sim/faults', { requestId: api.id(), robotId, changes });
      } catch (e) {
        error = MESSAGES[e.code] || e.message || '故障请求未完成。';
      } finally {
        busy = false;
      }
      await refresh();
    }

    function schedule() {
      if (timer !== null) root.clearInterval(timer);
      timer = visible && !destroyed ? root.setInterval(() => refresh({ fromPoll: true }), POLL_MS) : null;
    }

    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-fault-set]');
      if (!button || button.disabled) return;
      send(button.dataset.faultRobot, { [button.dataset.faultSet]: parseValue(button.dataset.faultValue) });
    });
    container.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-fault-battery]');
      if (!form) return;
      event.preventDefault();
      const value = Number(form.elements.battery.value);
      if (form.elements.battery.value === '' || !Number.isFinite(value) || value < 0 || value > 100) {
        error = '电量须为 0 到 100。';
        render();
        return;
      }
      send(form.dataset.faultBattery, { batteryPercent: value });
    });

    render();
    if (visible) refresh();
    schedule();

    return {
      refresh,
      setVisible(next) {
        visible = next === true;
        if (visible) refresh();
        schedule();
      },
      destroy() {
        destroyed = true;
        schedule();
      },
    };
  }

  const api = { mount, view, badges, robotCard, historyList, parseValue };
  root.SimFaultUI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
