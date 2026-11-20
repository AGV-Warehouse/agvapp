(function(root) {
  'use strict';
  const PARAM = 'portalRelease';
  const validRelease = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const pagePaths = ['/', '/index.html', '/editor.html', '/scene-builder.html', '/example.html'];
  const messages = {
    LEGACY_PAGE: '另一个门户页面仍使用旧版更新方式，无法证明其资源版本。请先保存该页面的编辑并关闭它，再点击更新；当前页无需关闭。',
    PROBE_TIMEOUT: '另一个门户页面未及时响应版本核对。请切到该页面等待加载完成，再回到这里点击更新；该页面的编辑会保留。',
    PAGE_UNAVAILABLE: '核对期间有门户页面关闭或重新加载。请等页面稳定后再次点击更新。',
    RELEASE_MISMATCH: '另一个门户页面尚未确认自身版本。请先查看该页面的版本提示，保存编辑后按其提示恢复，再点击更新。',
    CACHE_UNAVAILABLE: '另一个门户页面所需的完整资源已不可用。请先保存该页面的编辑，并从其版本提示恢复完整资源，再点击更新。',
    RECOVERY_REQUIRED: '完整版本恢复页面的身份已变化。请重新打开该页面中的完整版本恢复入口。',
    PAGE_CHANGED: '核对期间打开了其他门户页面。请等它加载完成，再点击更新。',
    INCOMPLETE: '新版资源尚未完整就绪。当前版本保留，请恢复网络后检查更新。',
    UNAVAILABLE: '暂时无法核对新版。当前版本保留，请稍后检查更新。'
  };
  function pinnedURL(href, release) {
    const url = new URL(href); url.searchParams.set(PARAM, release); return url.href;
  }
  function updatedURL(href, release, previous) {
    const url = new URL(pinnedURL(href, release));
    url.searchParams.set('portalUpdatedFrom', previous); return url.href;
  }
  function consumeUpdateNotice(href, release) {
    const url = new URL(href), previous = url.searchParams.get('portalUpdatedFrom');
    const updated = validRelease(previous) && previous !== release && url.searchParams.get(PARAM) === release;
    url.searchParams.delete('portalUpdatedFrom');
    return {href: url.href, updated};
  }
  function apiBlocker(api, {includeStored=true}={}) {
    if (api?.portalSessionChanging) return '登录状态正在变更，请稍候再更新。';
    if (api?.inFlight?.size || api?.pending?.size || api?.mutationRequests)
      return '正在提交业务操作，请等待本次操作返回；结果不明时到“事件与对账 → 命令回执”核对原请求，再更新。';
    if (includeStored && api?.records?.some(record => !['ACCEPTED', 'REJECTED'].includes(record.status)))
      return '有结果待核对的原命令。请到“事件与对账 → 命令回执”查询原请求，确认后再更新；更新不会重发请求。';
    return '';
  }
  function exchange(worker, data, timeout = 6000) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(Error(messages.UNAVAILABLE)); return; }
      const channel = new root.MessageChannel();
      const timer = root.setTimeout(() => finish(null), timeout);
      function finish(value) {
        root.clearTimeout(timer); channel.port1.close();
        if (value) resolve(value); else reject(Error(messages.UNAVAILABLE));
      }
      channel.port1.onmessage = event => finish(event.data);
      try { worker.postMessage(data, [channel.port2]); } catch (_) { finish(null); }
    });
  }
  // Export pure/controller behavior for deterministic lifecycle tests.
  class Controller {
    constructor({release, getWorker, request = exchange, blockers = () => [], navigate, onChange = () => {}}) {
      this.release = release; this.getWorker = getWorker; this.request = request;
      this.blockers = blockers; this.navigate = navigate; this.onChange = onChange;
      this.state = {available: null, message: '', busy: false, checking: false, needsReview: false};
    }
    emit() { this.onChange(this.state); }
    async inspect() {
      const worker = this.getWorker();
      if (!worker) return;
      const status = await this.request(worker, {type: 'PORTAL_STATUS'});
      this.state.available = status.ok && status.protocol === 1 && validRelease(status.release) && status.release !== this.release ? {release: status.release, worker} : null;
      this.emit();
      return status;
    }
    async update() {
      if (this.state.busy || !this.state.available) return false;
      const blocked = this.blockers();
      if (blocked.length) { this.state.message = blocked.join(' '); this.state.needsReview = true; this.emit(); return false; }
      const offered = this.state.available;
      this.state.busy = true; this.state.needsReview = false; this.state.message = '正在切换完整版本；不会发送任务或服务操作。'; this.emit();
      try {
        const response = await this.request(offered.worker, {type: 'PORTAL_ACTIVATE'});
        if (!response.ok || response.release !== offered.release) throw Error(messages[response.code] || messages.UNAVAILABLE);
        // Editing may have continued while the worker checked other tabs. A new
        // active worker can serve this pinned old page, so preserving edits is safe.
        const changed = this.blockers();
        if (changed.length) { this.state.needsReview = true; throw Error(changed.join(' ') + ' 本页已保留原版本和编辑，请处理后再更新。'); }
        this.navigate(offered.release);
        return true;
      } catch (error) { this.state.message = error.message || messages.UNAVAILABLE; return false; }
      finally { this.state.busy = false; this.emit(); }
    }
  }
  const exported = {Controller, pinnedURL, updatedURL, consumeUpdateNotice, apiBlocker, validRelease, messages};
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (!root.document || !root.navigator?.serviceWorker) return;
  const document = root.document;
  const release = document.querySelector('meta[name="portal-release"]')?.content;
  if (!validRelease(release)) return; // Source preview is not a packaged release.
  // Runs before other scripts. HTML resource URLs are also pinned by the packager,
  // so speculative parser/preloader requests cannot race this history update.
  const updateNotice = consumeUpdateNotice(root.location.href, release);
  root.history.replaceState(root.history.state, '', pinnedURL(updateNotice.href, release));
  const guards = new Map(), reviewActions = new Map();
  const bootstrapping = !root.navigator.serviceWorker.controller;
  let ready = root.location.pathname === '/example.html', registration = null, panel = null, firstLoad = null, checking = false, lastCheck = 0;
  if (bootstrapping) for (const type of ['click', 'pointerdown', 'keydown', 'beforeinput', 'submit']) {
    document.addEventListener(type, event => {
      if (firstLoad?.contains(event.target) || document.getElementById?.('portalAssetError')?.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
  }
  const controller = new Controller({
    release, getWorker: () => registration?.waiting || registration?.active,
    blockers: () => collectBlockers(),
    navigate: next => root.location.replace(updatedURL(root.location.href, next, release)),
    onChange: () => render()
  });
  if (updateNotice.updated) controller.state.message = '网页已更新，原页面位置已保留。有效的操作员登录可继续使用。原请求不会自动重发。';
  function ownBlockers() {
    if (root.__portalAssetFailed) return ['页面资源未完整加载，请使用页面中的“重新打开完整版本”。'];
    if (!ready) return ['页面仍在加载，请等工作区加载完成后再更新。'];
    const list = [];
    for (const guard of guards.values()) {
      try { const value = guard(); if (value) list.push(value); }
      catch (_) { list.push('尚未确认当前编辑状态，请先保存或关闭编辑器，再更新。'); }
    }
    return list;
  }
  function collectBlockers() {
    const list = ownBlockers();
    for (const frame of document.querySelectorAll('iframe')) {
      let url;
      try { url = new URL(frame.src, root.location.href); } catch (_) { continue; }
      if (url.origin !== root.location.origin || !pagePaths.includes(url.pathname)) continue;
      try {
        const child = frame.contentWindow;
        if (!child || child.location.origin !== root.location.origin || !pagePaths.includes(child.location.pathname) ||
            child.PortalUpdates?.release !== release) {
          list.push('嵌入的编辑器仍在加载或版本尚未确认，请等它加载完成，或保存后关闭编辑器再更新。');
        } else {
          list.push(...child.PortalUpdates.blockers());
        }
      } catch (_) { list.push('暂时无法核对嵌入编辑器，请保存并关闭编辑器后再更新。'); }
    }
    return [...new Set(list)];
  }
  const publicAPI = {
    release, addGuard(name, fn) { guards.set(name, fn); }, ready() { ready = true; },
    addReviewAction(name, getAction) { reviewActions.set(name, getAction); },
    reviewAction() { for (const getAction of reviewActions.values()) { const action = getAction(); if (action?.label && typeof action.go === 'function') return action; } return null; },
    blockers: collectBlockers, apiBlocker,
    pin(href) { return pinnedURL(new URL(href, root.location.href).href, release); },
    async update() { await controller.inspect(); return controller.update(); }
  };
  root.PortalUpdates = publicAPI;
  function ownerUpdates() {
    try { if (root.parent !== root && root.parent.location.origin === root.location.origin && root.parent.PortalUpdates) return root.parent.PortalUpdates; } catch (_) { /* Independent page. */ }
    return publicAPI;
  }
  root.navigator.serviceWorker.addEventListener('message', event => {
    const port = event.ports?.[0]; if (!port || event.data?.type !== 'PORTAL_VERSION_PROBE') return;
    let source; try { source = new URL(event.source.scriptURL); } catch (_) { return; }
    if (source.origin !== root.location.origin || source.pathname !== '/sw.js') return;
    port.postMessage({protocol: 1, release: new URL(root.location.href).searchParams.get(PARAM) === release ? release : null, bootstrapping});
  });
  // Internal links and dynamically created embedded editors inherit the page's
  // generation. The SW also uses pinned referrers for lazy/static fetches.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]'); if (!link) return;
    const url = new URL(link.href, root.location.href);
    if (url.origin === root.location.origin && pagePaths.includes(url.pathname)) link.href = pinnedURL(url.href, release);
  }, true);
  function render() {
    if (!panel) return;
    const state = controller.state;
    const status = panel.querySelector('[data-update-message]');
    const action = panel.querySelector('[data-update-apply]');
    panel.querySelector('[data-update-version]').textContent = updateNotice.updated ? '网页已更新 · 查看版本' : '网页版本与更新';
    panel.querySelector('[data-update-identifier]').textContent = '当前网页版本：' + release.slice(0, 8);
    status.textContent = state.message || (state.available ?
      '新版已完整校验。更新会重载当前页面及其编辑器。有效的操作员登录可继续使用，原请求不会自动重发。' :
      '当前页面保持此版本。检查更新不会启动仿真或重发请求。');
    action.hidden = !state.available; action.disabled = state.busy;
    action.textContent = state.busy ? '正在更新…' : '一键更新此页';
    panel.querySelector('[data-update-check]').disabled = checking || state.busy;
    const review = state.needsReview ? ownerUpdates().reviewAction?.() : null;
    const reviewButton = panel.querySelector('[data-update-review]');
    reviewButton.hidden = !review; reviewButton.textContent = review?.label || '前往核对原请求'; reviewButton.disabled = state.busy;
    if (state.available || state.message) panel.open = true;
    if (firstLoad) {
      firstLoad.querySelector('p').textContent = state.message || '首次打开需要准备完整网页。进入后仍需验证连接权限；不会启动仿真或重发任务。';
    }
  }
  function observeInstalling(worker) {
    if (!worker || worker.__portalObserved) return;
    worker.__portalObserved = true;
    if (registration.active) { controller.state.message = '发现新版，正在下载并校验完整资源；当前页面继续使用原版本。'; render(); }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        controller.state.message = '';
        // registration.waiting is assigned around the installed transition.
        root.setTimeout(() => { controller.inspect().catch(showFailure); checkFirstLoad(); }, 50);
      }
      if (worker.state === 'redundant') showFailure();
    });
  }
  function showFailure() {
    controller.state.message = '新版未能完整下载或校验，当前版本保留。请确认网络已连接后点击“检查更新”。'; render();
  }
  async function check(manual = false) {
    if (!registration || checking || (!manual && Date.now() - lastCheck < 60000)) return;
    checking = true; lastCheck = Date.now();
    if (manual) controller.state.message = '正在检查是否有完整可用的新版…';
    render();
    try {
      await registration.update();
      await controller.inspect();
      if (manual && !registration.installing) {
        const blocked = ownerUpdates().blockers();
        controller.state.needsReview = blocked.length > 0;
        const versionStatus = controller.state.available ? '新版已完整校验。' : '当前没有已校验的新版本。';
        controller.state.message = blocked.length ? versionStatus + ' 更新前需先核对：' + blocked.join(' ') : controller.state.available ? '' : versionStatus;
      }
    } catch (_) { showFailure(); }
    finally { checking = false; render(); }
  }
  async function start() {
    panel = document.createElement('details'); panel.className = 'portal-update-panel';
    panel.setAttribute('aria-label', '网页版本与更新');
    panel.innerHTML = '<summary><span data-update-version></span></summary><p data-update-message role="status"></p><div><button type="button" class="button" data-update-check>检查更新</button><button type="button" class="button button-primary" data-update-apply hidden>一键更新此页</button><button type="button" class="button" data-update-review hidden>前往核对原请求</button></div><small data-update-identifier></small>';
    document.body.append(panel); render();
    if (updateNotice.updated) {
      const focusNotice = () => { if (!document.querySelector('dialog[open]')) panel.querySelector('summary').focus({preventScroll: true}); };
      const dialog = document.querySelector('dialog[open]');
      if (dialog) dialog.addEventListener('close', focusNotice, {once: true}); else focusNotice();
    }
    if (bootstrapping) {
      firstLoad = document.createElement('dialog'); firstLoad.className = 'portal-first-load';
      firstLoad.innerHTML = '<h2>准备完整网页版本</h2><p>正在下载并校验网页资源…</p><button type="button" class="button button-primary" disabled>进入已校验工作区</button><button type="button" class="button" data-bootstrap-check>重新检查</button>';
      firstLoad.addEventListener('cancel', event => event.preventDefault());
      firstLoad.querySelector('button').onclick = enterFirstLoad;
      firstLoad.querySelector('[data-bootstrap-check]').onclick = async () => { await check(true); await checkFirstLoad(); };
      document.body.append(firstLoad); firstLoad.showModal();
    }
    panel.querySelector('[data-update-check]').onclick = () => check(true);
    panel.querySelector('[data-update-review]').onclick = () => {
      const action = ownerUpdates().reviewAction?.();
      controller.state.message = action ? action.go() || '已打开原请求所在区域。核对后请再次明确点击更新。' : '待核对事项已变化，请再次点击更新以核对当前状态。';
      controller.state.needsReview = !!action; render();
    };
    panel.querySelector('[data-update-apply]').onclick = async () => {
      // A button inside the modal editor updates its owning top-level page.
      const owner = ownerUpdates();
      const blocked = owner.blockers();
      if (blocked.length) { controller.state.message = blocked.join(' '); controller.state.needsReview = true; render(); return; }
      if (owner !== publicAPI) {
        const result = await owner.update();
        if (!result) { controller.state.message = '尚未完成更新。请核对工作台的版本提示；本编辑器与修改均已保留。'; render(); }
      } else await controller.update();
    };
    try {
      registration = await root.navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'});
      registration.addEventListener('updatefound', () => observeInstalling(registration.installing));
      observeInstalling(registration.installing);
      await controller.inspect();
      await checkFirstLoad();
      check();
    } catch (_) { showFailure(); }
    root.navigator.serviceWorker.addEventListener('controllerchange', () => {
      controller.inspect().catch(showFailure);
    });
    root.addEventListener('online', () => check(true));
    root.addEventListener('focus', () => check());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    root.setInterval(() => { if (!document.hidden) check(); }, 60000);
  }
  async function checkFirstLoad() {
    if (!firstLoad || !registration) return;
    const worker = registration.waiting || registration.active;
    if (!worker || worker.state === 'activating') {
      root.setTimeout(checkFirstLoad, 100); return;
    }
    try {
      const status = await exchange(worker, {type: 'PORTAL_STATUS'});
      firstLoad.querySelector('button').disabled = !(status.ok && status.protocol === 1 && validRelease(status.release));
      if (status.ok) firstLoad.querySelector('p').textContent = '完整网页已校验。点击进入工作区；不会启动仿真或重发任务。';
    } catch (_) { showFailure(); }
  }
  async function enterFirstLoad() {
    const button = firstLoad.querySelector('button'); button.disabled = true;
    try {
      const worker = registration.waiting || registration.active;
      const status = await exchange(worker, {type: 'PORTAL_STATUS'});
      if (!status.ok || !validRelease(status.release)) throw Error(messages.INCOMPLETE);
      if (registration.waiting) {
        const result = await exchange(worker, {type: 'PORTAL_ACTIVATE'});
        if (!result.ok) throw Error(messages[result.code] || messages.UNAVAILABLE);
      }
      // This page's address is already pinned (replaceState at load), so the
      // target often differs only by nothing at all; with a #route hash,
      // location.replace() is then a same-document hash change that never
      // reloads, leaving the bootstrap dialog up and the page blocked.
      const target = pinnedURL(root.location.href, status.release);
      if (target.split('#')[0] === root.location.href.split('#')[0]) root.location.reload();
      else root.location.replace(target);
    } catch (error) { firstLoad.querySelector('p').textContent = error.message; button.disabled = false; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})(globalThis);
