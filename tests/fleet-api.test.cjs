const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function context(fetch) {
  class Events {
    constructor(url) {this.url=url;this.handlers={};}
    addEventListener(name,handler) {this.handlers[name]=handler;}
  }
  const originalFetch=fetch;
  fetch=async(url,options)=>{
    const response=await originalFetch(url,options), json=response.json;
    response.json=async()=>{
      const value=await json();
      if(value.status) return {protocolVersion:'1.0',requestId:options.body?JSON.parse(options.body).requestId:url.split('/').pop(),updatedAt:new Date().toISOString(),result:null,error:null,resource:{},confirmation:'not physical completion',...value};
      return value;
    };
    return response;
  };
  const values=new Map();
  const scope={URL,location:{origin:'https://fleet.test'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},navigator:{locks:{request:async(name,fn)=>fn()}},fetch,EventSource:Events,setInterval:()=>0,Date,crypto:require('node:crypto').webcrypto,Uint8Array};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../fleet-api.js'),'utf8'),scope);
  return scope;
}
test('UI uses versioned management envelope and credentials only in header',async()=>{
  let observed;
  const scope=context(async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({status:'ACCEPTED',result:{id:'order'}})};});
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='secret';api.configureDeployment({});api.authorized=true;
  const result=await api.order({requestId:'same-intent',robotId:'R1',to:'A'});
  assert.equal(result.id,'order');assert.equal(observed.url,'https://fleet.test/api/v1/commands');
  assert.equal(observed.options.headers['X-Fleet-Key'],'secret');
  const message=JSON.parse(observed.options.body);
  assert.equal(message.requestId,'same-intent');assert.equal(message.protocolVersion,'1.0');
  assert.deepEqual(message.command,{type:'create_order',robotId:'R1',destination:'A'});
  assert.equal(observed.options.cache,'no-store');
});
test('unknown outcomes reuse the exact envelope including expiry',async()=>{
  const sent=[];
  const scope=context(async(url,options)=>{sent.push(options.body);return {ok:true,json:async()=>({status:'UNKNOWN'})};});
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='test';api.configureDeployment({});api.authorized=true;
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'A'}),/Query receipt/);
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'A'}),/Query receipt/);
  assert.equal(sent.length,1); // A saved unresolved envelope is queried, never reposted.
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'B'}),/cannot change/);
  assert.equal(sent.length,1);
});
test('rejection is surfaced and broken or malformed streams invalidate connection',async()=>{
  let connected=true;
  const scope=context(async()=>({ok:false,status:409,json:async()=>({error:{message:'Vehicle offline'}})}));
  const api=new scope.FleetAPI(()=>{},value=>{connected=value;});api.key='test';api.configureDeployment({});api.authorized=true;
  await assert.rejects(()=>api.order({to:'A',robotId:'R1'}),/Vehicle offline/);
  scope.fetch=async()=>({ok:true,json:async()=>({robots:[]})});
  await api.start();assert.equal(api.events.url,'/api/v1/events');
  api.events.onerror();assert.equal(connected,false);
  connected=true;api.events.handlers.fleet({data:'invalid'});assert.equal(connected,false);
});
test('fleet actions preserve per-robot partial failure',async()=>{
  const scope=context(async(url,options)=>({ok:true,json:async()=>url.endsWith('capabilities')?{robotIds:['A','B']}:
    JSON.parse(options.body).command.robotId==='A'?{status:'ACCEPTED',result:{}}:{status:'UNKNOWN'}}));
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='test';api.configureDeployment({});api.authorized=true;const result=await api.fleet('pause');
  assert.equal(result.allAccepted,false);assert.equal(result.results[0].accepted,true);assert.equal(result.results[1].accepted,false);
});

test('control key verification only reads a receipt and preserves auth failures',async()=>{
  let observed;
  const scope=context(async(url,options)=>{observed={url,options};return {ok:false,status:404,json:async()=>({protocolVersion:'1.0',error:{code:'REQUEST_NOT_FOUND',category:'protocol',message:'Not found',retry:'correct_request'}})};});
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='test-only-key';api.configureDeployment({});
  await api.verifyKey();
  assert.match(observed.url,/^https:\/\/fleet\.test\/api\/v1\/commands\/access-check-/);
  assert.equal(observed.options.method,'GET');assert.equal(observed.options.body,undefined);
  assert.equal(observed.options.headers['X-Fleet-Key'],'test-only-key');
  scope.fetch=async()=>({ok:false,status:401,json:async()=>({detail:'Authentication required'})});
  await assert.rejects(()=>api.verifyKey(),error=>error.status===401);
});

test('operator login shares same-origin credentials without retaining or replaying the control key',async()=>{
  const calls=[], channels=[];
  let role=null;
  const scope=context(async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/portal/session')){
      if(options.method==='POST') role='operator';
      if(options.method==='DELETE') role=null;
      return {ok:true,json:async()=>({authenticated:!!role,role})};
    }
    if(url.endsWith('/image.png')) return {ok:true,blob:async()=>new Blob(['raster'])};
    return {ok:true,json:async()=>url.endsWith('/capabilities')?{deploymentId:'pair'}:
      options.method==='POST'?{status:'ACCEPTED',result:{id:'order'}}:{available:true}};
  });
  scope.BroadcastChannel=class {
    constructor(){channels.push(this);}
    postMessage(value){for(const channel of channels)if(channel!==this)channel.onmessage({data:value});}
  };
  const portal=new scope.FleetAPI(()=>{},()=>{});
  await portal.watchPortalSession();
  assert.equal(portal.authorized,false);
  await portal.loginPortal('test-only-key');
  assert.equal(portal.authorized,true);
  assert.equal(portal.portalRole,'operator');
  assert.equal(portal.key,'');
  const login=calls.find(c=>c.options.method==='POST');
  assert.equal(login.url,'https://fleet.test/api/v1/portal/session');
  assert.equal(login.options.headers['X-Fleet-Key'],'test-only-key');
  assert.equal(login.options.body,undefined);
  assert.equal(login.options.credentials,'same-origin');
  assert.equal(login.options.redirect,'error');
  assert.equal(scope.localStorage.getItem('fleet-command-receipts.v1'),null);
  await portal.order({robotId:'R1',to:'A',requestId:'existing'});
  const command=calls.at(-1);
  assert.equal(command.options.credentials,'same-origin');
  assert.equal(command.options.headers['X-Fleet-Key'],undefined);
  const secondTab=new scope.FleetAPI(()=>{},()=>{});
  const beforeRestore=calls.length;
  await secondTab.watchPortalSession();
  assert.equal(secondTab.authorized,true);
  assert.equal(secondTab.key,'');
  assert.equal(secondTab.receiptSnapshot().records[0].envelope.requestId,'existing');
  assert.ok(calls.slice(beforeRestore).every(c=>c.options.method==='GET' && !c.options.headers?.['X-Fleet-Key']));
  const raster=await secondTab.request('map-workspace/rasters/'+'a'.repeat(32)+'/image.png',undefined,{rasterImage:true});
  assert.equal(await raster.text(),'raster');
  await portal.logoutPortal();
  await new Promise(setImmediate);
  assert.equal(portal.authorized,false);
  assert.equal(secondTab.authorized,false);
  assert.ok(calls.some(c=>c.options.method==='DELETE'&&c.options.headers===undefined));
  const count=calls.length;
  await assert.rejects(secondTab.order({robotId:'R1',to:'A',requestId:'blocked'}),e=>e.code==='AUTH_REQUIRED');
  assert.equal(calls.length,count);
});

test('session identity distinguishes automation and drops stale operator permission on HTTP 401',async()=>{
  let role='automation', status=200;
  const scope=context(async(url)=>({
    ok:url.endsWith('/capabilities')||url.endsWith('/portal/session')||status===200,
    status:url.endsWith('/commands/prior')?status:200,
    json:async()=>url.endsWith('/portal/session')?{authenticated:!!role,role}:{}
  }));
  const api=new scope.FleetAPI(()=>{},()=>{});
  await api.watchPortalSession();
  assert.equal(api.portalRole,'automation');
  assert.equal(api.receiptSnapshot().canWrite,false);
  await assert.rejects(api.request('sim/environment/controls',{}),e=>e.code==='AUTH_REQUIRED');
  role='operator';
  await api.restorePortalSession();
  assert.equal(api.receiptSnapshot().canWrite,true);
  status=401;
  await assert.rejects(api.request('commands/prior'),e=>e.status===401);
  assert.equal(api.authorized,false);
  assert.equal(api.portalRole,null);
});

test('external and HTTP development targets keep only explicitly authorized credentials',async()=>{
  for(const [origin,base] of [
    ['https://fleet.test','https://other.test/api/v1/'],
    ['http://localhost:55231','http://localhost:55231/api/v1/']
  ]){
    const calls=[];
    const scope=context(async(url,options)=>{
      calls.push({url,options});
      return url.includes('/commands/')?
        {ok:false,status:404,json:async()=>({protocolVersion:'1.0',error:{code:'REQUEST_NOT_FOUND',category:'protocol',message:'Not found',retry:'correct_request'}})}:
        {ok:true,json:async()=>({})};
    });
    scope.location.origin=origin;
    const api=new scope.FleetAPI(()=>{},()=>{});
    api.apiBase=base;
    await api.watchPortalSession();
    assert.equal(calls.length,0);
    await api.loginPortal('explicit-only-key');
    assert.equal(api.authorized,true);
    assert.ok(calls.every(c=>!c.url.endsWith('/portal/session')));
    assert.equal(calls.at(-1).options.headers['X-Fleet-Key'],'explicit-only-key');
    assert.equal(calls.at(-1).options.credentials,'omit');
    await api.logoutPortal();
    assert.equal(api.authorized,false);
  }
});


test('scenario PUT is explicit and limited while replay reads remain scoped GET requests',async()=>{
 const seen=[];const scope=context(async(url,options)=>{seen.push({url,options});return {ok:true,json:async()=>({saved:true})};});
 const api=new scope.FleetAPI(()=>{},()=>{});api.key='test';api.configureDeployment({});api.authorized=true;
 await api.request('sim-scenarios/scene-one',{expectedRevision:0},{method:'PUT'});
 await api.request('sim-replay/runs/run-one?after=0');
 assert.equal(seen[0].options.method,'PUT');assert.equal(seen[1].options.method,'GET');assert.equal(api.scopeBoundRequests,0);
 await assert.rejects(api.request('commands',{}, {method:'PUT'}),/Unsupported request method/);assert.equal(seen.length,2);
});

test('fleet review rejects changed vehicle scope before any command submission',async()=>{const calls=[];const scope=context(async(url,options)=>{calls.push({url,body:options.body});return {ok:true,json:async()=>({robotIds:['A','B']})};});const api=new scope.FleetAPI(()=>{},()=>{});await assert.rejects(()=>api.fleet('pause',['A']),/车辆范围已变化/);assert.equal(calls.length,1);assert.equal(calls[0].body,undefined);});

test('update mutation counter distinguishes overlapping polling GETs from a live business POST',async()=>{
 const deferred=[];const scope=context(()=>new Promise(resolve=>deferred.push(resolve)));
 const api=new scope.FleetAPI(()=>{},()=>{}),read=api.request('sim/environment');
 assert.equal(api.scopeBoundRequests,1);assert.equal(api.mutationRequests,0);
 const write=api.request('sim/environment/controls',{requestId:'new-request'});
 assert.equal(api.scopeBoundRequests,2);assert.equal(api.mutationRequests,1);
 deferred[0]({ok:true,json:async()=>({})});await read;
 assert.equal(api.scopeBoundRequests,1);assert.equal(api.mutationRequests,1);
 deferred[1]({ok:true,json:async()=>({})});await write;
 assert.equal(api.scopeBoundRequests,0);assert.equal(api.mutationRequests,0);
});
test('failed mutation releases update counter without turning uncertain command receipts into completed records',async()=>{
 const scope=context(async()=>{throw Error('offline');}),api=new scope.FleetAPI(()=>{},()=>{});
 await assert.rejects(api.request('sim/environment/controls',{}));assert.equal(api.mutationRequests,0);
});
test('explicit PUT is a mutation for updates even when its body is absent',async()=>{
 let complete;const scope=context(()=>new Promise(resolve=>complete=resolve)),api=new scope.FleetAPI(()=>{},()=>{});
 const pending=api.request('sim-scenarios/original',undefined,{method:'PUT'});
 assert.equal(api.mutationRequests,1);complete({ok:true,json:async()=>({})});await pending;assert.equal(api.mutationRequests,0);
});
test('scene clearance checks require operator access and bind the response without recording a mutation',async()=>{
  let complete;
  const scope=context(()=>new Promise(resolve=>{complete=resolve;})),api=new scope.FleetAPI(()=>{},()=>{});
  api.portalSessionWatching=true;
  await assert.rejects(api.request('map-workspace/scene-clearance',{}),e=>e.code==='AUTH_REQUIRED');
  api.key='test';api.configureDeployment({});api.authorized=true;
  const pending=api.request('map-workspace/scene-clearance',{});
  assert.equal(api.scopeBoundRequests,1);
  assert.equal(api.mutationRequests,0);
  assert.equal(api.submittedInTab?.has(api.scope)||false,false);
  complete({ok:true,json:async()=>({issues:[]})});
  await pending;
  assert.equal(api.scopeBoundRequests,0);
});
