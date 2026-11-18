const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto,createHash}=require('node:crypto');
const {MessageChannel}=require('node:worker_threads');
const A='a'.repeat(64),B='b'.repeat(64),origin='https://fleet.example';
const sw=fs.readFileSync(require.resolve('../sw.js'),'utf8');
function harness({release=A,stores=new Map(),bad=false,swRelease=release,clients=[]}={}){
 const events={},calls=[];let skipped=0,claimed=0;
 const material={'index.html':'<html>generation '+release+'</html>','scene-builder.html':'editor '+release,'app.js':'app '+release,'portal-update.js':'updater '+release,'sw.js':sw.replaceAll('__PORTAL_RELEASE__',swRelease)};
 material['web-assets.json']=JSON.stringify([...Object.keys(material),'web-assets.json']);
 const manifest=Object.fromEntries(Object.entries(material).map(([path,body])=>[path,createHash('sha256').update(body).digest('hex')]));
 const caches={keys:async()=>[...stores.keys()],delete:async k=>stores.delete(k),open:async key=>{
  if(!stores.has(key))stores.set(key,new Map());const store=stores.get(key);
  return {put:async(k,v)=>store.set(k,v),match:async k=>store.get(k)?.clone(),delete:async k=>store.delete(k)};
 }};
 const context={URL,Response,MessageChannel,crypto:webcrypto,caches,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,30)),clearTimeout,self:{
  location:new URL(origin+'/sw.js'),addEventListener:(key,fn)=>events[key]=fn,
  skipWaiting:async()=>{skipped++;},clients:{matchAll:async()=>typeof clients==='function'?clients():clients,claim:async()=>{claimed++;}}
 },fetch:async url=>{
  calls.push(url);const p=new URL(url).pathname.slice(1);
  if(p==='asset-manifest.json')return new Response(JSON.stringify(manifest));
  return new Response(bad?'mixed generation':material[p]||'missing',{status:material[p]?200:404});
 }};
 vm.runInNewContext(sw.replaceAll('__PORTAL_RELEASE__',release),context);
 async function lifecycle(name){let promise;events[name]({waitUntil:p=>promise=p});return promise;}
 async function request(path,referrer='',mode='navigate'){
  let promise;events.fetch({request:{url:origin+path,method:'GET',referrer,mode},respondWith:p=>promise=p});return promise;
 }
 async function message(type,source,extra={}){let promise,result;events.message({data:{...extra,type},source,ports:[{postMessage:r=>result=r}],waitUntil:p=>promise=p});await promise;return result;}
 return {events,stores,calls,context,lifecycle,request,message,get skipped(){return skipped;},get claimed(){return claimed;}};
}
function client(id,release=A,reply=true){return {id,frameType:'top-level',url:origin+'/?portalRelease='+release+'#/maps',postMessage(data,ports){if(reply)ports[0].postMessage({protocol:1,release});ports[0].close();}};}
async function installed(options){const h=harness(options);await h.lifecycle('install');return h;}
function documentClient(id,creationURL,release=A,frames=[]){
 const listeners={},location=new URL(creationURL),navigations=[];
 location.replace=href=>navigations.push(href);
 const document={readyState:'loading',querySelector:q=>q==='meta[name="portal-release"]'?{content:release}:null,
  querySelectorAll:()=>frames,addEventListener(){}};
 const context={URL,document,location,navigator:{serviceWorker:{controller:{},addEventListener:(type,fn)=>listeners[type]=fn}},
  history:{state:null,replaceState:(state,title,href)=>{location.href=href;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../portal-update.js'),'utf8'),context);
 context.PortalUpdates.ready();
 // Client.url is the document creation URL, not its history.replaceState URL.
 const c={id,frameType:'top-level',url:creationURL,postMessage:(data,ports)=>listeners.message({data,ports,source:{scriptURL:origin+'/sw.js'}})};
 return {client:c,context,location,navigations};
}
async function recoveryDocument(h,id,creationURL){
 const html=await(await h.request('/?portalRecovery=1')).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],listeners={},location=new URL(creationURL);
 const context={URL,location,history:{replaceState:(state,title,href)=>{location.href=href;}},
  document:{querySelector:()=>({})},navigator:{serviceWorker:{addEventListener:(type,fn)=>listeners[type]=fn}}};
 context.parent=context;context.window=context;
 vm.runInNewContext(script,context);
 const c={id,frameType:'top-level',url:creationURL,postMessage:(data,ports)=>listeners.message({data,ports,source:{scriptURL:origin+'/sw.js'}})};
 return {client:c,location,listeners};
}

test('real document probes permit unpinned creation URLs after boot pins parent, iframe and clean tab',async()=>{
 const a=await installed();
 const child=documentClient('editor',origin+'/scene-builder.html?sceneId=42&embedded=1');
 child.client.frameType='nested';
 child.context.PortalUpdates.addGuard('draft',()=> '场景未保存');
 const parent=documentClient('dirty-parent',origin+'/#/simulation',A,[{src:child.client.url,contentWindow:child.context}]);
 const clean=documentClient('current',origin+'/#/operations');
 for(const page of [parent,child,clean]){
  assert.equal(new URL(page.client.url).searchParams.has('portalRelease'),false);
  assert.equal(page.location.searchParams.get('portalRelease'),A);
 }
 assert.equal(parent.context.PortalUpdates.blockers()[0],'场景未保存');
 const b=await installed({release:B,stores:a.stores,clients:[clean.client,parent.client,child.client]});
 const result=await b.message('PORTAL_ACTIVATE',clean.client);
 assert.equal(result.ok,true);assert.equal(b.skipped,1);
 assert.equal(parent.context.PortalUpdates.blockers()[0],'场景未保存');
 for(const page of [parent,child,clean]){assert.deepEqual(page.navigations,[]);assert.equal(page.location.searchParams.get('portalRelease'),A);}
 assert.equal(await(await b.request('/scene-builder.html?sceneId=42',parent.location.href)).text(),'editor '+A);
});

test('full hash verification serves offline generation; install never activates it',async()=>{
 const h=await installed();h.context.fetch=async()=>{throw Error('offline');};
 assert.equal(await (await h.request('/?view=map')).text(),'<html>generation '+A+'</html>');
 assert.equal(h.skipped,0);
 assert.equal((await h.message('PORTAL_STATUS')).ok,true);
 for(const path of ['/api/v1/history/tasks','/sim-viewer/']){
  h.events.fetch({request:{url:origin+path,method:'GET'},respondWith:()=>assert.fail('API/viewer remain network-only')});
 }
 h.events.fetch({request:{url:origin+'/api/v1/sim-runs',method:'POST'},respondWith:()=>assert.fail('control traffic')});
});
test('mixed hashes delete only incomplete candidate, preserving original generation',async()=>{
 const a=await installed(),b=harness({release:B,stores:a.stores,bad:true});
 await assert.rejects(b.lifecycle('install'),/Mixed or incomplete/);
 assert.deepEqual([...a.stores.keys()],['fleetserver-portal-'+A]);
 assert.equal(b.skipped,0);
});
test('deployment changing between SW download and manifest fetch cannot label C assets as B',async()=>{
 const h=harness({release:B,swRelease:A});await assert.rejects(h.lifecycle('install'),/Release changed/);
 assert.equal(h.stores.size,0);
});
test('new worker serves old tab scripts and dynamic iframe navigation from the old referrer',async()=>{
 const a=await installed(),b=await installed({release:B,stores:a.stores});
 for(const [path,referrer,expected] of [
  ['/app.js',origin+'/?portalRelease='+A,'app '+A],
  ['/scene-builder.html?sceneId=42',origin+'/?portalRelease='+A,'editor '+A],
  ['/app.js?portalRelease='+B,origin+'/?portalRelease='+A,'app '+B],
  ['/app.js',origin+'/styles.css?portalRelease='+A,'app '+A]
 ]) assert.equal(await(await b.request(path,referrer)).text(),expected);
});
test('unknown, missing, and evicted old generation never fetch unverified network assets',async()=>{
 const h=await installed({release:B});const before=h.calls.length;
 const missing=await h.request('/app.js?portalRelease='+A,'','script');
 assert.equal(missing.status,503);assert.equal(h.calls.length,before);
 assert.equal((await h.request('/?portalRelease=invalid')).status,503);
 h.stores.get('fleetserver-portal-'+B).delete(origin+'/app.js');
 assert.equal((await h.request('/app.js?portalRelease='+B,'','script')).status,503);
 assert.equal((await h.message('PORTAL_STATUS')).ok,false);
});
test('explicit update allows known dirty tabs to keep their generation and preserves caches',async()=>{
 const a=await installed(),clients=[client('current'),client('other')];
 const b=await installed({release:B,stores:a.stores,clients});
 const result=await b.message('PORTAL_ACTIVATE',clients[0]);assert.equal(result.ok,true);assert.equal(b.skipped,1);
 await b.lifecycle('activate');assert.equal(b.claimed,0);
 assert.equal(a.stores.size,2);assert.equal(await(await b.request('/?portalRelease='+A)).text(),'<html>generation '+A+'</html>');
});
test('legacy or unresponsive tabs prevent activation without deleting either complete cache',async()=>{
 const a=await installed(),clients=[client('current'),client('legacy',A,false)];
 const b=await installed({release:B,stores:a.stores,clients});
 assert.equal((await b.message('PORTAL_ACTIVATE',clients[0])).code,'PROBE_TIMEOUT');
 assert.equal(b.skipped,0);assert.equal(a.stores.size,2);
});
test('new page opened during handshake requires a fresh user update attempt',async()=>{
 const a=await installed();let reads=0;const first=client('first');
 const b=await installed({release:B,stores:a.stores,clients:()=>++reads===1?[first]:[first,client('new')]});
 assert.equal((await b.message('PORTAL_ACTIVATE',first)).code,'PAGE_CHANGED');assert.equal(b.skipped,0);
});
test('old protocol, invalid current pin and evicted prior cache have distinct blocking reasons',async()=>{
 for(const [kind,expected] of [['legacy','LEGACY_PAGE'],['pin','RELEASE_MISMATCH'],['cache','CACHE_UNAVAILABLE'],['gone','PAGE_UNAVAILABLE']]){
  const a=await installed(),clean=documentClient('current',origin+'/#/operations');
  const other=documentClient('other',origin+'/editor.html?sceneId=42');
  if(kind==='legacy')other.client.postMessage=(data,ports)=>ports[0].postMessage({protocol:0,release:A});
  if(kind==='pin')other.location.searchParams.set('portalRelease',B);
  if(kind==='cache')a.stores.get('fleetserver-portal-'+A).delete(origin+'/app.js');
  if(kind==='gone')other.client.postMessage=()=>{throw Error('document closed');};
  const b=await installed({release:B,stores:a.stores,clients:[clean.client,other.client]});
  assert.equal((await b.message('PORTAL_ACTIVATE',clean.client)).code,expected);
  assert.equal(b.skipped,0);assert.deepEqual(clean.navigations,[]);assert.equal(a.stores.size,2);
 }
});

test('source outside known portal paths cannot activate even with a valid version response',async()=>{
 const a=await installed();
 for(const url of ['https://other.example/?portalRelease='+A,origin+'/sim-viewer/?portalRelease='+A]){
  const source=client('foreign');source.url=url;
  const b=await installed({release:B,stores:a.stores,clients:[source]});
  assert.equal((await b.message('PORTAL_ACTIVATE',source)).ok,false);assert.equal(b.skipped,0);
 }
});

test('a current document pin differing from its embedded release cannot authorize activation',async()=>{
 const a=await installed(),page=documentClient('current',origin+'/?portalRelease='+A);
 page.location.searchParams.set('portalRelease',B);
 const b=await installed({release:B,stores:a.stores,clients:[page.client]});
 assert.equal((await b.message('PORTAL_ACTIVATE',page.client)).code,'RELEASE_MISMATCH');assert.equal(b.skipped,0);
});

test('first-load source still needs a valid current document version proof',async()=>{
 const source=client('first-load');source.postMessage=(data,ports)=>ports[0].postMessage({protocol:1,release:null,bootstrapping:true});
 const h=await installed({clients:[source]});
 assert.equal((await h.message('PORTAL_ACTIVATE',source)).code,'RELEASE_MISMATCH');assert.equal(h.skipped,0);
 source.postMessage=(data,ports)=>ports[0].postMessage({protocol:1,release:B,bootstrapping:true});
 assert.equal((await h.message('PORTAL_ACTIVATE',source)).ok,true);assert.equal(h.skipped,1);
});

test('cache-loss page offers UI repair and explicit repair rebuilds a whole verified cache',async()=>{
 const clients=[],h=await installed({clients});h.stores.clear();
 const page=await h.request('/?portalRelease='+A);
 assert.equal(page.status,503);assert.match(await page.text(),/重新下载完整版本/);
 const recovery=await recoveryDocument(h,'repair',origin+'/?portalRelease='+A);clients.push(recovery.client);
 assert.equal(new URL(recovery.client.url).searchParams.has('portalRecovery'),false);
 assert.equal(recovery.location.searchParams.get('portalRecovery'),'1');
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).ok,true);
 assert.equal((await h.message('PORTAL_STATUS')).ok,true);
 assert.equal(await(await h.request('/app.js?portalRelease='+A)).text(),'app '+A);
});

test('failed repair stays failed, never activates or replays a business request',async()=>{
 const clients=[],h=harness({clients,bad:true}),recovery=await recoveryDocument(h,'repair',origin+'/');clients.push(recovery.client);
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).ok,false);assert.equal(h.skipped,0);
 assert(h.calls.every(url=>!url.includes('/api/')));
});

test('partial cached generation can be repaired, not mistaken for complete by its marker',async()=>{
 const clients=[],h=await installed({clients}),recovery=await recoveryDocument(h,'repair',origin+'/');clients.push(recovery.client);
 h.stores.get('fleetserver-portal-'+A).delete(origin+'/app.js');
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).ok,true);
 assert.equal((await h.message('PORTAL_STATUS')).ok,true);
});

test('repair query or message claims do not replace a fresh source-specific recovery proof',async()=>{
 const page=documentClient('normal',origin+'/?portalRecovery=1'),clients=[page.client],h=await installed({clients});
 h.stores.clear();const calls=h.calls.length;
 assert.equal((await h.message('PORTAL_REPAIR',page.client,{protocol:1,recovery:true})).code,'RECOVERY_REQUIRED');
 assert.equal(h.calls.length,calls);assert.equal(h.skipped,0);assert.equal(h.stores.size,0);
 const recovery=await recoveryDocument(h,'recovery',origin+'/');clients.splice(0,1,recovery.client);
 recovery.location.searchParams.delete('portalRecovery');
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).code,'RECOVERY_REQUIRED');
 assert.equal(h.calls.length,calls);assert.equal(h.skipped,0);
});

test('recovery probe accepts only the same-origin SW and does not exempt other pages',async()=>{
 const clients=[],h=await installed({clients}),recovery=await recoveryDocument(h,'repair',origin+'/'),replies=[];
 for(const scriptURL of ['https://evil.example/sw.js',origin+'/other.js'])
  recovery.listeners.message({data:{type:'PORTAL_VERSION_PROBE'},source:{scriptURL},ports:[{postMessage:r=>replies.push(r)}]});
 assert.equal(replies.length,0);
 recovery.listeners.message({data:{type:'PORTAL_VERSION_PROBE'},source:{scriptURL:origin+'/sw.js'},ports:[{postMessage:r=>replies.push(r)}]});
 assert.equal(replies[0].recovery,true);
 clients.push(recovery.client,client('unresponsive',A,false));
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).code,'PROBE_TIMEOUT');assert.equal(h.skipped,0);
});

test('repair rechecks source identity after rebuilding and refuses a changed recovery document',async()=>{
 const source=client('repair');let probes=0;
 source.postMessage=(data,ports)=>ports[0].postMessage({protocol:1,recovery:++probes===1});
 const h=harness({clients:[source]});
 assert.equal((await h.message('PORTAL_REPAIR',source)).code,'RECOVERY_REQUIRED');
 assert.equal(probes,2);assert.equal(h.skipped,0);assert.equal((await h.message('PORTAL_STATUS')).ok,true);
});

test('nested recovery documents cannot independently repair or switch their owning generation',async()=>{
 const clients=[],h=await installed({clients}),recovery=await recoveryDocument(h,'nested',origin+'/editor.html');
 recovery.client.frameType='nested';clients.push(recovery.client);h.stores.clear();const calls=h.calls.length;
 assert.equal((await h.message('PORTAL_REPAIR',recovery.client)).code,'RECOVERY_REQUIRED');
 assert.equal(h.skipped,0);assert.equal(h.calls.length,calls);assert.equal(h.stores.size,0);
});

test('cache-loss iframe returns to its owning workspace instead of independently switching generations',async()=>{
 const h=await installed();h.stores.clear();const html=await(await h.request('/scene-builder.html?embedded=1&portalRelease='+A)).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],button={},status={},messages=[],listeners={};
 const parent={location:new URL(origin+'/'),document:{getElementById:id=>id==='editorWorkspace'?{}:null},postMessage:(message,target)=>messages.push([message,target])};
 const context={URL,location:new URL(origin+'/scene-builder.html?embedded=1&portalRelease='+A),history:{replaceState(){}},
  document:{querySelector:selector=>selector==='button'?button:status},parent,window:{},addEventListener:(type,fn)=>listeners[type]=fn,
  navigator:{serviceWorker:{getRegistration(){assert.fail('iframe must not replace its own generation');}}}};
 vm.runInNewContext(script,context);
 assert.match(button.textContent,/返回工作台更新/);button.onclick();assert.equal(messages[0][0].type,'fleet-editor-close');
 listeners.message({origin:'https://evil.example',source:parent,data:{type:'fleet-editor-close-request'}});
 assert.equal(messages.length,1);
 listeners.message({origin,source:parent,data:{type:'fleet-editor-close-request'}});
 assert.equal(messages.length,2);assert.equal(messages[1][1],origin);
});
