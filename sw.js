/* Each document keeps a verified asset generation, including embedded editors.
   Activation never deletes old caches or reloads other tabs with unsaved work. */
const RELEASE = '__PORTAL_RELEASE__';
const PREFIX = 'fleetserver-portal-';
const CACHE_NAME = PREFIX + RELEASE;
const MANIFEST = new URL('asset-manifest.json', self.location).href;
const COMPLETE = new URL('.portal-complete', self.location).href;
const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const assetPath = path => typeof path === 'string' && !path.includes('\\') &&
  !path.includes(':') && !path.startsWith('/') &&
  path.split('/').every(part => part && !part.startsWith('.'));
const hex = buffer => Array.from(new Uint8Array(buffer), n => n.toString(16).padStart(2, '0')).join('');
const portalPage = url => url.origin === self.location.origin && ['/', '/index.html', '/editor.html', '/scene-builder.html', '/example.html'].includes(url.pathname);

async function completeCache(release) {
  if (!version(release) || !(await caches.keys()).includes(PREFIX + release)) return null;
  const cache = await caches.open(PREFIX + release);
  return await cache.match(COMPLETE) ? cache : null;
}

async function installRelease() {
    if (await cacheAvailable(RELEASE)) return;
    const response = await fetch(MANIFEST, {cache: 'no-store'});
    if (!response.ok) throw Error('Asset manifest unavailable');
    const manifest = await response.json(), entries = Object.entries(manifest);
    if (!version(RELEASE) || !entries.length || !manifest['sw.js'] || !manifest['web-assets.json'] || !manifest['portal-update.js'] ||
        entries.some(([path, hash]) => !assetPath(path) || !/^[a-f0-9]{64}$/.test(hash))) throw Error('Invalid asset manifest');
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(COMPLETE);
    try {
      for (const [path, expected] of entries) {
        const url = new URL(path, self.location), key = url.href;
        url.searchParams.set('portalRelease', RELEASE);
        const asset = await fetch(url.href, {cache: 'no-store'});
        if (!asset.ok || hex(await crypto.subtle.digest('SHA-256', await asset.clone().arrayBuffer())) !== expected) throw Error('Mixed or incomplete asset release');
        if (path === 'sw.js' && !(await asset.clone().text()).includes("const RELEASE = '" + RELEASE + "';")) throw Error('Release changed during install');
        if (path === 'web-assets.json' && JSON.stringify((await asset.clone().json()).sort()) !== JSON.stringify(Object.keys(manifest).sort())) throw Error('Incomplete asset list');
        await cache.put(key, asset);
      }
      await cache.put(MANIFEST, new Response(JSON.stringify(manifest)));
      // Written last: partial caches cannot serve pages or announce an update.
      await cache.put(COMPLETE, new Response(RELEASE));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
}
self.addEventListener('install', event => { event.waitUntil(installRelease()); });

async function cacheAvailable(release) {
  const cache = await completeCache(release);
  if (!cache) return false;
  const manifest = await cache.match(MANIFEST);
  if (!manifest) return false;
  for (const path of Object.keys(await manifest.json())) {
    if (!await cache.match(new URL(path, self.location).href)) return false;
  }
  return true;
}

function probe(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish({code: 'PROBE_TIMEOUT'}), 2500);
    function finish(value) { clearTimeout(timer); channel.port1.close(); resolve(value); }
    channel.port1.onmessage = event => finish({reply: event.data});
    try { client.postMessage({type: 'PORTAL_VERSION_PROBE'}, [channel.port2]); }
    catch (_) { finish({code: 'PAGE_UNAVAILABLE'}); }
  });
}

async function activateFor(source, repair = false) {
  if (!source || !portalPage(new URL(source.url)) || !await cacheAvailable(RELEASE)) return {ok: false, code: 'INCOMPLETE'};
  // Legacy pages cannot prove that they pin assets. They must be saved and closed.
  const clients = (await self.clients.matchAll({type: 'window', includeUncontrolled: true})).filter(c => portalPage(new URL(c.url)));
  if (!clients.some(client => client.id === source.id)) return {ok: false, code: 'PAGE_CHANGED'};
  const results = await Promise.all(clients.map(async client => {
    const {reply, code} = await probe(client);
    if (code) return code;
    if (reply?.protocol !== 1) return 'LEGACY_PAGE';
    if (repair && client.id === source.id) return reply.recovery === true ? '' : 'RECOVERY_REQUIRED';
    // Client.url is the creation URL; history.replaceState does not update it.
    // This dedicated port binds the reply to this exact enumerated document.
    // Its updater proves the current document URL matches its embedded release.
    if (!version(reply.release)) return 'RELEASE_MISMATCH';
    if (client.id === source.id && reply.bootstrapping === true) return '';
    return await cacheAvailable(reply.release) ? '' : 'CACHE_UNAVAILABLE';
  }));
  const failure = results.find(Boolean);
  if (failure) return {ok: false, code: failure};
  const current = (await self.clients.matchAll({type: 'window', includeUncontrolled: true})).filter(c => portalPage(new URL(c.url)));
  if (current.some(c => !clients.some(old => old.id === c.id && old.url === c.url))) return {ok: false, code: 'PAGE_CHANGED'};
  await self.skipWaiting();
  return {ok: true, release: RELEASE};
}

self.addEventListener('message', event => {
  const port = event.ports?.[0];
  if (!port || !['PORTAL_STATUS', 'PORTAL_ACTIVATE', 'PORTAL_REPAIR'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'PORTAL_REPAIR') {
        if (!event.source || event.source.frameType !== 'top-level' || !portalPage(new URL(event.source.url))) { port.postMessage({ok: false, code: 'RECOVERY_REQUIRED'}); return; }
        const proof = await probe(event.source);
        if (proof.code || proof.reply?.protocol !== 1 || proof.reply.recovery !== true) {
          port.postMessage({ok: false, code: proof.code || 'RECOVERY_REQUIRED'}); return;
        }
        await installRelease();
        port.postMessage(await activateFor(event.source, true));
      } else port.postMessage(event.data.type === 'PORTAL_ACTIVATE' ? await activateFor(event.source) : {ok: await cacheAvailable(RELEASE), release: RELEASE, protocol: 1});
    } catch (_) { port.postMessage({ok: false, code: 'UNAVAILABLE'}); }
  })());
});

self.addEventListener('activate', event => {
  // Do not claim uncontrolled legacy documents. A first load enters the verified
  // workspace via explicit navigation; controlled pinned pages need no claim.
  event.waitUntil(Promise.resolve());
});

function requestedRelease(event, url) {
  if (url.searchParams.has('portalRelease')) return url.searchParams.get('portalRelease');
  try {
    const referrer = new URL(event.request.referrer);
    if (referrer.origin === self.location.origin && referrer.searchParams.has('portalRelease')) return referrer.searchParams.get('portalRelease');
  } catch (_) { /* New top-level navigation has no referrer. */ }
  return RELEASE;
}

function unavailable(navigation) {
  const message = '这个页面所用版本的完整资源已不可用。请先保存其他页面的编辑，再重新下载完整版本。不会发送任务、启动服务或重发原请求。';
  const repair = `<script>
    const u=new URL(location.href);u.searchParams.set('portalRecovery','1');history.replaceState(null,'',u);
    const button=document.querySelector('button'),status=document.querySelector('[role=status]');
    let embedded=false;try{embedded=parent!==window&&parent.location.origin===location.origin&&!!parent.document.getElementById('editorWorkspace');}catch(_){}
    const leave=()=>parent.postMessage({type:'fleet-editor-close'},location.origin);
    if(embedded){button.textContent='关闭编辑器，返回工作台更新';status.textContent='请返回工作台使用“检查更新”与“一键更新此页”，编辑器会随所属页面使用同一完整版本。';button.onclick=leave;addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='fleet-editor-close-request')leave();});}
    else {navigator.serviceWorker.addEventListener('message',e=>{const p=e.ports?.[0];if(!p||e.data?.type!=='PORTAL_VERSION_PROBE')return;let s;try{s=new URL(e.source.scriptURL);}catch(_){return;}if(s.origin!==location.origin||s.pathname!=='/sw.js')return;p.postMessage({protocol:1,recovery:new URL(location.href).searchParams.get('portalRecovery')==='1'});});
    button.onclick=async()=>{button.disabled=true;status.textContent='正在重新下载并校验完整版本…';try{
      const r=await navigator.serviceWorker.getRegistration();if(!r)throw Error();
      await r.update();
      if(r.installing)await new Promise((resolve,reject)=>{const w=r.installing;const timer=setTimeout(reject,60000);w.addEventListener('statechange',()=>{if(w.state==='installed'){clearTimeout(timer);resolve();}if(w.state==='redundant'){clearTimeout(timer);reject();}});});
      const worker=r.waiting||r.active;
      const reply=await new Promise((resolve,reject)=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();reject();},60000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data);};worker.postMessage({type:'PORTAL_REPAIR'},[c.port2]);});
      if(!reply.ok){const reasons={LEGACY_PAGE:'其他页面仍使用旧版更新方式，请先保存并关闭该页面，再重试。',PROBE_TIMEOUT:'其他页面未及时响应，请切到该页面等待加载完成后重试；其编辑会保留。',PAGE_UNAVAILABLE:'核对期间有页面关闭或重新加载，请等页面稳定后重试。',RELEASE_MISMATCH:'其他页面尚未确认自身版本，请先核对该页面的版本提示。',CACHE_UNAVAILABLE:'其他页面所需的完整资源已不可用，请先保存该页面的编辑，再从其版本提示恢复。',RECOVERY_REQUIRED:'当前恢复页面身份已变化，请重新打开页面中的完整版本恢复入口。',PAGE_CHANGED:'核对期间打开了其他页面，请等它加载完成后重试。'};status.textContent=reasons[reply.code]||'完整版本尚未就绪，请恢复网络后重试。';return;}
      const next=new URL(location.href);next.searchParams.delete('portalRecovery');next.searchParams.set('portalRelease',reply.release);location.replace(next);
    }catch(_){status.textContent='完整版本下载或校验未完成。请确认网络已连接，然后重试；其他页面的版本与编辑没有被更换。';}finally{button.disabled=false;}};}
  </script>`;
  return new Response(navigation ? '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面版本不可用</title><body><h1>页面版本不可用</h1><p>' + message + '</p><button>重新下载完整版本</button><p role="status"></p>'+repair+'</body></html>' : message, {status: 503, headers: {'Content-Type': navigation ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'}});
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sim-viewer/')) return;
  event.respondWith((async () => {
    if (event.request.mode === 'navigate' && url.searchParams.get('portalRecovery') === '1') return unavailable(true);
    const cache = await completeCache(requestedRelease(event, url));
    const key = new URL(url.pathname === '/' ? 'index.html' : url.pathname, self.location).href;
    return cache && await cache.match(key) || unavailable(event.request.mode === 'navigate');
  })());
});
