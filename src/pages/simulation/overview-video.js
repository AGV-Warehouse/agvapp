(function (root) {
  'use strict';

  function registrationMatches(value, map) {
    if (!map || !value || value.schemaVersion !== 1 || value.frame !== 'map' ||
        !/^[a-f0-9]{32}$/.test(value.session || '') || !map.publicationId ||
        !map.releaseId || !map.mapId || !map.rasterHash || !map.worldHash ||
        value.releaseId !== map.releaseId || value.mapId !== map.mapId ||
        value.frame !== map.frame || value.rasterSha256 !== map.rasterHash ||
        value.worldHash !== map.worldHash ||
        value.publicationId != null && value.publicationId !== map.publicationId) return false;
    const {width, height, validRect, pixelToWorld: m} = value;
    if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 4096) ||
        !validRect || !Array.isArray(m) || m.length !== 9 || !m.every(Number.isFinite)) return false;
    const {x, y, width: w, height: heightOfRect} = validRect;
    if (![x, y, w, heightOfRect].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || heightOfRect <= 0 || x + w > width || y + heightOfRect > height) return false;
    const [a,b,c,d,e,f,g,h,i] = m;
    const det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
    return Number.isFinite(det) && det !== 0 && [
      [x,y], [x+w,y], [x,y+heightOfRect], [x+w,y+heightOfRect],
    ].every(([u,v]) => {
      const k = g*u+h*v+i;
      return Number.isFinite(k) && k > 0 && Number.isFinite((a*u+b*v+c)/k) && Number.isFinite((d*u+e*v+f)/k);
    });
  }

  // Compose raw camera pixels → map coordinates → SVG units → screen → the layer's local pixels.
  function projectedMatrix(m, screen, origin, toSVG) {
    const [sx,sy] = toSVG(1,1), [ox,oy] = toSVG(0,0);
    const [a,b,c,d,e,f,g,h,i] = m;
    const screenX = screen.e - origin.left + screen.a*ox + screen.c*oy;
    const screenY = screen.f - origin.top + screen.b*ox + screen.d*oy;
    const row = (x,y,z) => [x*a+y*d+z*g, x*b+y*e+z*h, x*c+y*f+z*i];
    const X = row(screen.a*(sx-ox), screen.c*(sy-oy), screenX);
    const Y = row(screen.b*(sx-ox), screen.d*(sy-oy), screenY);
    return [X[0],Y[0],0,g, X[1],Y[1],0,h, 0,0,1,0, X[2],Y[2],0,i];
  }

  function playerURL(value, mode, location) {
    if (!value || !['side','overlay'].includes(mode)) return null;
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || url.pathname !== '/sim-viewer/' || url.username || url.password || url.search || url.hash) return null;
      url.searchParams.set('mode', mode === 'overlay' ? 'overlay' : 'overhead');
      return url.href;
    } catch (_) { return null; }
  }

  function observationMap(state) {
    const map = state?.map;
    return state?.activePublicationStatus === 'READY' && map?.frame === 'map' &&
      /^[a-f0-9]{32}$/.test(map.releaseId || '') && map.releaseId === state.releaseId &&
      typeof map.publicationId === 'string' && map.publicationId && map.publicationId === state.activePublicationId &&
      typeof map.mapId === 'string' && map.mapId &&
      [map.rasterHash, map.worldHash, map.modelHash].every(hash => /^[a-f0-9]{64}$/.test(hash || '')) ? map : null;
  }

  const mapIdentity = map => map ? JSON.stringify([
    map.publicationId, map.releaseId, map.mapId, map.frame, map.rasterHash, map.worldHash, map.modelHash,
  ]) : null;

  function observationModel(value, map) {
    const model = value?.model;
    return map && value?.releaseId === map.releaseId && model?.source === 'openTCS' && model.units === 'm' &&
      ['points', 'paths', 'stations'].every(key => Array.isArray(model[key])) ? model : null;
  }

  function observationBackground(background, map) {
    return !!(map && background?.source === 'published-scene' && background.releaseId === map.releaseId &&
      background.imageUrl === `/api/v1/map-background/image.png?releaseId=${map.releaseId}`);
  }

  async function readObservation(path, signal) {
    const timeout = root.AbortSignal?.timeout?.(4000);
    const response = await root.fetch(`/api/v1/sim/observation${path}`, {
      credentials: 'omit', mode: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: (timeout && root.AbortSignal.any?.([signal, timeout])) || signal,
    });
    if (!response.ok) throw new Error('Observation unavailable');
    return response.json();
  }

  function monitorGuest({active, onChange, request = readObservation, now = () => root.performance.now()}) {
    let scope = null, status = null, model = null, unavailable = false, previous = null;
    const statusQuery = {next: 0, pending: null};
    const modelQuery = {next: 0, pending: null};
    const reset = query => {
      query.pending?.controller.abort();
      query.pending = null;
      query.next = 0;
    };

    function snapshot() {
      if (!scope || active() !== scope) return null;
      const state = status && now() - status.at < 5000 ? status.state : null;
      const map = observationMap(state);
      const currentModel = model && now() - model.at < 12000 && model.identity === mapIdentity(map) ? model.value : null;
      return {guest: true, state, map, model: currentModel, viewerURL: state?.viewerURL,
        unavailable: unavailable || !!status && !state};
    }

    function publish() {
      const value = snapshot();
      if (!!value === !!previous && value?.state === previous?.state &&
          value?.model === previous?.model && value?.unavailable === previous?.unavailable) return;
      previous = value;
      onChange(value);
    }

    async function query(state, path, delay, apply) {
      const at = now();
      if (state.pending || at < state.next) return;
      const pending = {controller: new AbortController(), scope};
      state.pending = pending;
      state.next = at + delay;
      let value;
      try { value = await request(path, pending.controller.signal); }
      catch (_) { value = null; }
      if (state.pending !== pending || active() !== pending.scope) return;
      state.pending = null;
      apply(value, at);
      publish();
    }

    function tick() {
      const next = active();
      if (scope !== next) {
        reset(statusQuery);
        reset(modelQuery);
        scope = next;
        status = model = null;
        unavailable = false;
      }
      publish();
      if (!scope) return;
      query(statusQuery, '', 1800, (value, at) => {
        const map = mapIdentity(observationMap(value)), oldMap = mapIdentity(observationMap(status?.state));
        const prior = status?.state;
        if (map !== oldMap) {
          reset(modelQuery);
          model = null;
        }
        const found = value && typeof value === 'object' &&
          (value.viewerURL === null || typeof value.viewerURL === 'string');
        const unchanged = prior && map === oldMap && value?.viewerURL === prior.viewerURL &&
          value.activePublicationId === prior.activePublicationId && value.activePublicationStatus === prior.activePublicationStatus &&
          value.releaseId === prior.releaseId;
        status = found ? {state: unchanged ? prior : value, at} : null;
        unavailable = !found;
      });
      const map = snapshot()?.map;
      if (!map) return;
      query(modelQuery, `/model?releaseId=${map.releaseId}`, model ? 7500 : 2300, (value, at) => {
        const verified = observationModel(value, map);
        const current = model?.value;
        model = verified ? {value: JSON.stringify(verified) === JSON.stringify(current) ? current : verified,
          identity: mapIdentity(map), at} : null;
        if (!verified) modelQuery.next = now() + 2300;
      });
    }
    return {tick, snapshot};
  }

  function mount(options) {
    const {elements: el} = options;
    const buttons = [...el.modes.querySelectorAll('[data-overview-mode]')];
    let active = false, mode = 'map', observation = null, frame = null, playing = null;
    let registration = null, registrationState = null, request = null, registrationFailed = false, registrationRetryAt = 0;
    const currentObservation = () => options.authorized() ? observation : options.guestObservation?.();

    function dropRegistration() {
      request?.abort();
      request = registration = registrationState = null;
      registrationFailed = false;
      registrationRetryAt = 0;
    }
    function dropFrame() {
      frame?.remove();
      frame = playing = null;
      dropRegistration();
    }
    function project() {
      if (!active || mode !== 'overlay' || !frame || !registration ||
          !(playing?.playing && playing.session === registration.session) ||
          !registrationMatches(registration, options.mapContext(currentObservation()?.state))) {
        if (frame && mode === 'overlay') frame.style.opacity = '0';
        return false;
      }
      const ctm = el.svg.getScreenCTM();
      const rect = el.overlayHost.getBoundingClientRect();
      const matrix = ctm && rect.width && rect.height && projectedMatrix(registration.pixelToWorld, ctm, rect, options.toSVG);
      if (!matrix || !matrix.every(Number.isFinite)) {
        frame.style.opacity = '0';
        return false;
      }
      const {width, height, validRect} = registration;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.clipPath = `inset(${validRect.y}px ${width-validRect.x-validRect.width}px ${height-validRect.y-validRect.height}px ${validRect.x}px)`;
      frame.style.transform = `matrix3d(${matrix.join(',')})`;
      frame.style.opacity = '';
      return true;
    }

    async function readRegistration(url, status, retry = false) {
      const now = root.performance?.now() ?? Date.now();
      if (request || status === registrationState && (!retry || now < registrationRetryAt)) return;
      registrationState = status;
      registrationRetryAt = now + 2000;
      const pending = new AbortController();
      request = pending;
      try {
        const result = await root.fetch(new URL('registration.json', url).href,
          {cache:'no-store', credentials:'same-origin', signal:pending.signal});
        if (!result.ok) throw new Error('Registration unavailable');
        const value = await result.json();
        if (request !== pending) return;
        registration = value;
        registrationFailed = false;
      } catch (_) {
        if (request !== pending) return;
        registration = null;
        registrationFailed = true;
      } finally {
        if (request === pending) {
          request = null;
          render();
        }
      }
    }

    function render() {
      const observation = currentObservation();
      const show = active && mode !== 'map';
      const url = show && playerURL(observation?.viewerURL, mode, root.location);
      const state = observation?.state;
      el.layout.dataset.mode = mode;
      el.controls.hidden = !show;
      el.sidePanel.hidden = !url || mode !== 'side';
      el.overlayHost.hidden = !url || mode !== 'overlay';
      if (frame && frame.getAttribute('src') !== url) dropFrame();
      if (url && !frame) {
        frame = el.svg.ownerDocument.createElement('iframe');
        frame.title = mode === 'overlay' ? '已配准的 Gazebo 画面' : 'Gazebo 俯视直播';
        frame.setAttribute('src', url);
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.setAttribute('allow', 'autoplay; fullscreen');
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        if (mode === 'overlay') {
          frame.tabIndex = -1;
          frame.style.opacity = '0';
        }
        (mode === 'overlay' ? el.overlayHost : el.sideHost).append(frame);
      }
      if (mode === 'overlay' && url && state?.activePublicationStatus === 'READY')
        readRegistration(url, observation.guest ? JSON.stringify([state.activePublicationId, state.releaseId, playing?.session]) : state,
          observation.guest && (registrationFailed || playing?.playing && playing.session !== registration?.session));
      if (!show) return;
      const shown = project();
      const authorized = observation?.authorized ?? options.authorized();
      const reviewing = observation?.reviewOpen === true;
      const prepare = ['READY_PUBLICATION_REQUIRED','SIM_NOT_READY','WORKER_NOT_RUNNING'].includes(state?.actions?.startViewer?.reason);
      const guestCanRequestOpening = observation?.guest && !!state && !observation.viewerURL;
      el.access.hidden = !guestCanRequestOpening;
      if (guestCanRequestOpening) el.access.textContent = '登录以开启直播';
      el.open.hidden = !observation?.canOpen;
      el.review.hidden = !observation?.canReviewClose || reviewing;
      el.refresh.hidden = !authorized || observation?.busy || (url && !registrationFailed);
      el.prepare.hidden = !prepare;
      el.stopReview.hidden = !reviewing;
      if (reviewing) el.stopContext.textContent = `${state?.scene?.name || '当前隔离仿真'} · 待核对任务 ${state?.activeRunIds?.length || 0} 项`;

      let message;
      if (observation?.error) message = observation.error;
      else if (observation?.busy) message = '正在核对直播操作，请稍候。';
      else if (observation?.pending) message = '直播操作结果待核对。刷新状态会查询原请求。';
      else if (!state) message = observation?.unavailable || !authorized && !observation ? '暂未取得直播状态。' : '正在读取直播状态…';
      else if (!url) message = observation.viewerURL ? '当前环境未提供同源俯视直播。'
        : observation.guest ? '当前没有可播放的直播。'
        : observation.canOpen ? '直播已关闭。需要观察时可打开直播。'
        : observation.writable === false ? '当前会话可读取环境状态。打开直播需要操作权限。'
        : observation.reason || '暂未取得直播画面。';
      else if (mode === 'side') message = playing?.playing
        ? '直播画面 · 地图使用最新可用定位，视频有直播缓冲。'
        : playing?.message || '正在等待 Gazebo 实时画面…';
      else if (shown) message = '已按地面配准 · 离地物体可能有视差。地图使用最新可用定位，视频有直播缓冲。';
      else if (state.activePublicationStatus !== 'READY') message = '当前发布版本未就绪，继续显示二维地图。';
      else if (registrationFailed) message = '配准资料暂不可用，继续显示二维地图。';
      else if (registration && !registrationMatches(registration, options.mapContext(state))) message = '正在核对地图版本与配准资料，继续显示二维地图。';
      else if (registration && playing?.playing && playing.session !== registration.session) message = '直播已切换，正在重新核对配准。';
      else if (playing?.message && !playing.playing) message = `${playing.message} 二维地图可继续使用。`;
      else message = '正在等待配准和实时画面，二维地图可继续使用。';
      if (el.status.textContent !== message) el.status.textContent = message;
    }

    function setMode(value) {
      if (value === mode || !['map','side','overlay'].includes(value)) return;
      mode = value;
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.overviewMode === mode));
      options.observe(active && mode !== 'map');
      render();
      options.onLayoutChange();
    }

    for (const button of buttons) button.addEventListener('click', () => setMode(button.dataset.overviewMode));
    el.access.addEventListener('click', options.access);
    el.open.addEventListener('click', options.open);
    el.review.addEventListener('click', () => {
      options.review();
      if (!el.stopReview.hidden) el.confirm.focus();
    });
    el.confirm.addEventListener('click', options.close);
    el.back.addEventListener('click', () => {options.cancel(); el.review.focus();});
    el.refresh.addEventListener('click', options.refresh);
    root.addEventListener('message', event => {
      if (!frame || event.origin !== root.location.origin || event.source !== frame.contentWindow ||
          event.data?.type !== 'fleet-sim-viewer-status') return;
      const {playing: isPlaying, session, message} = event.data;
      playing = {
        playing: isPlaying === true && /^[a-f0-9]{32}$/.test(session || ''),
        session,
        message: typeof message === 'string' ? message.slice(0, 140) : '',
      };
      render();
    });
    root.ResizeObserver && new root.ResizeObserver(project).observe(el.svg);

    return {
      setActive(value) {
        if (active === value) return;
        active = value;
        render();
      },
      refreshObservation() { options.observe(active && mode !== 'map'); },
      setObservation(value) { observation = value; render(); },
      render,
      project,
    };
  }

  const api = {mount, monitorGuest, readObservation, observationMap, observationModel, observationBackground,
    playerURL, projectedMatrix, registrationMatches};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OverviewVideo = api;
})(globalThis);
