const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Offline DOM harness: verifies route and control wiring, not visual layout.
function boot({hash='#/operations', pending=false, publishing=false, simulation=false, scenario=false, history=false, actualAPI=false, guestFacts}={}) {
  const markup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const elements=new Map(), listeners={},updateGuards=new Map(),updateReviewActions=new Map();
  class Element {
    constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.dataset={};this.handlers={};this.style={};this.classList={toggle(){},add(){},remove(){}};this.clientWidth=0;this.clientHeight=0;}
    setAttribute(name,value){this[name]=value;}
    getAttribute(name){return this[name]??null;}
    append(...nodes){this.children=(this.children||[]).concat(nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    removeAttribute(name){delete this[name];}
    addEventListener(name,fn){this.handlers[name]=fn;}
    querySelector(){return new Element('child');}
    querySelectorAll(){return [];}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');
  for(const id of ids)elements.set(id,new Element(id));
  const buttons=['operations','missions','maps','fleet','simulation','events'].map(route=>{const e=new Element(route);e.dataset.view=route;return e;});
  const snapshot={scope:'https://fixture/api/v1/',deploymentConfirmed:false,authorized:false,canWrite:false,records:pending?[{status:'UNKNOWN',envelope:{requestId:'saved-id',command:{type:'create_order',robotId:'R-old',destination:'ST-old'}}}]:[]};
  let api;
  class FleetAPI {
    constructor(onState,onConnection,onReceipts){api=this;this.onState=onState;this.onConnection=onConnection;this.onReceipts=onReceipts;this.key='';this.authorized=false;onReceipts(snapshot);}
    receiptSnapshot(){return snapshot;}
    watchPortalSession(){}
    async start(){this.onConnection(true);this.onState({upstreamOnline:true,upstreamAgeSeconds:2,robots:[{id:'R1',online:true,location:'ST-A'}],orders:[]});return {points:[{id:'ST-B',destination:'ST-B'}]};}
    async model(){this.modelCalls=(this.modelCalls||0)+1;return {name:'test-model',points:[],paths:[],stations:[{id:'ST-B'}]};}
    async request(path){(this.requests ||= []).push(path);return path==='layout'?{points:[{id:'ST-new',destination:'ST-new'}]}:{available:false};}
    hasUnresolvedCreate(){return snapshot.records.some(x=>x.status==='UNKNOWN');}
    async cancel(id){this.cancelledOrder=id;}
  }
  const mounts=[];
  const runMounts=[],scenarioMounts=[],replayMounts=[],historyMounts=[];
  const context={console,Date,Map,Set,Number,String,Boolean,Math,JSON,Promise,FormData:global.FormData,FleetAPI,PortalState:require('../portal-state.js'),URL,URLSearchParams,queueMicrotask,document:{createElement:tag=>new Element(tag),body:new Element('body'),addEventListener(){},getElementById:id=>{assert.ok(elements.has(id),'missing DOM '+id);return elements.get(id);},querySelector:()=>new Element('context-label'),querySelectorAll:selector=>selector.includes('.nav-item')?buttons:[]},location:{hash,protocol:'http:'},history:{replaceState(_a,_b,next){context.location.hash=next;}},navigator:{},setInterval:()=>0,setTimeout:()=>0,clearTimeout(){},window:{addEventListener(name,fn){listeners[name]=fn;},CommandReceipts:{mount(){return {render(){}};}}}};
  context.window.PortalUpdates={addGuard:(name,guard)=>updateGuards.set(name,guard),addReviewAction:(name,action)=>updateReviewActions.set(name,action),ready(){},apiBlocker:require('../portal-update.js').apiBlocker};
  if(publishing)context.window.MapReleaseUI={mount(_container,_api,options){const view={controller:{state:{busy:false}},authorizationChanged(){},destroy(){this.destroyed=true;}};mounts.push({view,options});return view;}};
  if(simulation)context.window.SimulationRunUI={mount(container,_api,options){const view={controller:{state:{busy:false}},setReadPaused(value){this.readsPaused=value;},authorizationChanged(){this.authorizationChecks=(this.authorizationChecks||0)+1;},destroy(){this.destroyed=true;}};runMounts.push({container,view,options});return view;}};
  if(scenario){context.window.ScenarioUI={mount(container,_api,options){const view={controller:{state:{busy:false}},setReadPaused(value){this.readsPaused=value;},authorizationChanged(){},destroy(){}};scenarioMounts.push({container,view,options});return view;}};context.window.ReplayUI={mount(container,options){const view={open(){options.onOpen();},close(){options.onClose();},destroy(){}};replayMounts.push({container,view,options});return view;}};}
  if(history)context.window.ServerHistoryUI={mount(container,_api,options){const view={controller:{submit(filters){view.filters=filters;}},setVisible(value){this.visible=value;},authorizationChanged(){this.authChecks=(this.authChecks||0)+1;}};historyMounts.push({container,options,view});return view;}};
  let finishBackground;
  const network=[];
  const observationTicks = [];
  if(actualAPI) {
    const base='https://fixture/api/v1/',values=new Map();
    const envelope={protocolVersion:'1.0',requestId:'old-fixture',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),command:{type:'create_order',robotId:'R1',destination:'A'}};
    values.set('fleet-command-receipts.v1',JSON.stringify({version:1,scopes:{[base]:[{scope:base,envelope,status:'UNKNOWN',receipt:null}]}}));
    context.location.origin='https://fixture';
    context.location.href='https://fixture/';
    context.URL=URL;context.Uint8Array=Uint8Array;context.crypto=require('node:crypto').webcrypto;
    context.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
    context.navigator.locks={request:async(_key,callback)=>callback()};
    context.EventSource=class {addEventListener(){}};
    context.fetch=async(url,options)=>{
      network.push({url,options});let value;
      if(url.endsWith('/map-background'))return new Promise(resolve=>{finishBackground=()=>resolve({ok:true,json:async()=>({available:false})});});
      if(guestFacts && url in guestFacts)value=guestFacts[url];
      else if(url.endsWith('/capabilities'))value={environment:'SIM',targetId:guestFacts?'p0-pair':'p0-sim',activeEnvironment:{kind:'SIM',capabilities:guestFacts?['managed_services']:[]},profileId:'empty-crossing-v1',deploymentId:'real-deployment'};
      else if(url.endsWith('/layout'))value={points:[{id:'ST-B',destination:'ST-B'}]};
      else if(url.endsWith('/robots'))value={upstreamOnline:true,robots:[{id:'R1',online:true}],orders:[]};
      else if(url.endsWith('/model'))value={name:'real-model',points:[],paths:[],stations:[{id:'ST-B'}]};
      else if(url.endsWith('/portal/session'))value={authenticated:false,role:null};
      else throw Error('Unexpected request '+url);
      return {ok:true,json:async()=>value};
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../fleet-api.js'),'utf8'),context);
    if(guestFacts) {
      context.addEventListener=()=>{};
      context.performance=context.window.performance=performance;
      context.AbortController=AbortController;
      context.setInterval=(fn, delay)=>{if(delay===150)observationTicks.push(fn);};
      vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/pages/simulation/overview-video.js'),'utf8'),context);
      context.window.OverviewVideo=context.OverviewVideo;
      vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../live-vehicle-poses.js'),'utf8'),context);
    }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  return {elements,buttons,api:actualAPI?context.window.fleetPortalApi:api,snapshot,context,listeners,mounts,runMounts,scenarioMounts,replayMounts,historyMounts,network,updateGuards,updateReviewActions,finishBackground:()=>finishBackground?.(),tickGuest:()=>observationTicks.forEach(fn=>fn())};
}
test('real shell restores routes, normalizes unknown hashes, and reuses existing panels',async()=>{
  const h=boot({hash:'#/bad'}); await new Promise(setImmediate);
  assert.equal(h.context.location.hash,'#/operations');
  for(const route of ['missions','maps','fleet','simulation','events','operations']){
    h.context.location.hash='#/'+route;h.listeners.hashchange();
    assert.equal(h.elements.get('workspace').dataset.route,route);
    assert.equal(h.elements.get('mapsWorkspace').hidden,route!=='maps');
    assert.equal(h.elements.get('rtsWorkspace').hidden,route!=='operations');
    assert.equal(h.elements.get('receiptWorkspace').hidden,!['missions','events'].includes(route));
  }
});

test('guest overview reads its own verified model and fresh pose without acquiring operator controls', async () => {
  const endpoint='/api/v1/sim/observation';
  const map={publicationId:'authored-publication',releaseId:'a'.repeat(32),mapId:'authored-map',frame:'map',
    rasterHash:'b'.repeat(64),worldHash:'c'.repeat(64),modelHash:'d'.repeat(64)};
  const h=boot({actualAPI:true,guestFacts:{
    [endpoint]:{activePublicationId:map.publicationId,activePublicationStatus:'READY',releaseId:map.releaseId,map,viewerURL:null},
    [endpoint+'/model?releaseId='+map.releaseId]:{releaseId:map.releaseId,model:{
      name:'Authored scene',source:'openTCS',units:'m',points:[{id:'AUTHORED-P1',x:1,y:2}],paths:[],stations:[],
    }},
    [endpoint+'/live-poses']:{releaseId:map.releaseId,mapId:map.mapId,frame:'map',positionUnits:'m',yawUnits:'rad',vehicles:[
      {id:'LAB-01',estimatedPose:{x:1,y:2,yaw:0,frame:'map',source:'FLEET_BRIDGE_TF',validForSeconds:1.8}},
    ]},
  }});
  await new Promise(setImmediate);
  for(let i=0;i<4;i++){h.tickGuest();await new Promise(setImmediate);}
  const reads=h.network.filter(({url})=>url.startsWith(endpoint));
  assert.equal(reads.length,3);
  assert.ok(reads.every(({options})=>options.credentials==='omit' && !options.method && !options.headers));
  assert.match(h.elements.get('mapPoints').innerHTML,/AUTHORED-P1/);
  assert.match(h.elements.get('robotMarkers').innerHTML,/LAB-01/);
  assert.match(h.elements.get('livePoseCaption').textContent,/Fleet Bridge 定位估计/);
  assert.equal(h.elements.get('sendOrderButton').disabled,true);
  assert.doesNotMatch(h.elements.get('attentionList').innerHTML,/当前仅可查询|请先登录操作员会话/);
  h.api.onState({upstreamOnline:false,upstreamAgeSeconds:90,robots:[],orders:[]});
  assert.match(h.elements.get('attentionList').innerHTML,/车队反馈中断或上游过期/);
  h.context.location.hash='#/fleet';h.listeners.hashchange();h.tickGuest();
  await new Promise(setImmediate);
  assert.equal(h.network.filter(({url})=>url.startsWith(endpoint)).length,3);
  assert.doesNotMatch(h.elements.get('mapPoints').innerHTML,/AUTHORED-P1/);
});

test('formal simulation shares existing shell and RTS view, restoring only confirmed deployment scope',async()=>{
  const h=boot({simulation:true,hash:'#/simulation'});await new Promise(setImmediate);
  assert.equal(h.runMounts.length,0);assert.equal(h.elements.get('simulationWorkspace').hidden,false);
  h.snapshot.deploymentConfirmed=true;h.snapshot.scope+='#deployment=A';h.api.onReceipts(h.snapshot);
  assert.equal(h.runMounts.length,1);assert.equal(h.runMounts[0].container.id,'simulationRunView');assert.equal(h.runMounts[0].options.operations.id,'rtsRunView');
  h.api.onReceipts(h.snapshot);assert.equal(h.runMounts.length,1);
  h.snapshot.scope='https://fixture/api/v1/#deployment=B';h.api.onReceipts(h.snapshot);
  assert.equal(h.runMounts.length,2);assert.equal(h.runMounts[0].view.destroyed,true);
  assert.equal(h.api.requests?.filter(p=>p.includes('sim-runs')).length||0,0,'shell itself never submits or duplicates runs');
});
test('constructor receipt restoration is safe and locks the saved intent across unavailable vehicles',async()=>{
  const h=boot({hash:'#/missions',pending:true}); await new Promise(setImmediate);
  assert.equal(h.elements.get('sendOrderButton').disabled,true);
  assert.equal(h.elements.get('dispatchRobot').disabled,true);
  assert.equal(h.elements.get('dispatchRobot').value,'R-old');
  assert.equal(h.elements.get('toPoint').value,'ST-old');
  assert.match(h.elements.get('attentionList').innerHTML,/saved-id/);
});
test('a key without verified authorization never enables controls',async()=>{
  const h=boot({hash:'#/missions'});await new Promise(setImmediate);
  h.api.key='not-verified';h.api.onReceipts(h.snapshot);
  assert.equal(h.elements.get('sendOrderButton').disabled,true);
  assert.match(h.elements.get('portalSessionState').textContent,/仅查看/);
  h.api.authorized=true;h.snapshot.canWrite=true;h.api.onReceipts(h.snapshot);
  assert.equal(h.elements.get('sendOrderButton').disabled,false);
  h.api.authorized=false;h.snapshot.canWrite=false;h.api.onReceipts(h.snapshot);
  assert.equal(h.elements.get('sendOrderButton').disabled,true);
});
test('verified key remains query-only when write capability is unavailable',async()=>{
  const h=boot({hash:'#/missions'});await new Promise(setImmediate);
  h.api.key='verified';h.api.authorized=true;
  h.snapshot.writeBlockedReason='需要 HTTPS / localhost 与跨页面请求锁';
  h.api.onReceipts(h.snapshot);
  assert.equal(h.elements.get('sendOrderButton').disabled,true);
  assert.equal(h.elements.get('estopButton').disabled,true);
  assert.equal(h.elements.get('resumeButton').disabled,true);
  assert.equal(h.elements.get('cancelOrder').disabled,true);
  assert.match(h.elements.get('attentionList').innerHTML,/HTTPS/);
});
test('restoring pending dispatch A cannot redirect cancellation from inspected vehicle B',async()=>{
  const h=boot({hash:'#/fleet',pending:true});await new Promise(setImmediate);
  h.api.key='verified';h.api.authorized=true;h.snapshot.canWrite=true;h.api.onReceipts(h.snapshot);
  h.api.onState({upstreamOnline:true,robots:[{id:'R-old',online:true,task:'order-A'},{id:'R-B',online:true,task:'order-B'}],orders:[]});
  h.elements.get('robotList').handlers.click({target:{closest:()=>({dataset:{robotId:'R-B'}})}});
  assert.equal(h.elements.get('selectedRobotName').textContent,'R-B');
  assert.equal(h.elements.get('dispatchRobot').value,'R-old');
  assert.equal(h.elements.get('cancelOrder').disabled,false);
  h.elements.get('cancelOrder').handlers.click();await new Promise(setImmediate);
  assert.equal(h.api.cancelledOrder,'order-B');
});
test('publication workspace mounts only after deployment confirmation and rebuilds for the new scope',async()=>{
  const h=boot({publishing:true});await new Promise(setImmediate);
  assert.equal(h.mounts.length,0);
  h.snapshot.deploymentConfirmed=true;h.snapshot.scope+='\u0023deployment=A';h.api.onReceipts(h.snapshot);
  assert.equal(h.mounts.length,1);
  h.api.onReceipts(h.snapshot);assert.equal(h.mounts.length,1);
  h.snapshot.scope='https://fixture/api/v1/#deployment=B';h.api.onReceipts(h.snapshot);
  assert.equal(h.mounts.length,2);assert.equal(h.mounts[0].view.destroyed,true);
});
test('new live admitted release refreshes only layout/model once and never submits a task',async()=>{
  const h=boot({publishing:true});await new Promise(setImmediate);
  h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);
  const before=h.api.modelCalls;
  const state={statusFresh:true,status:{enabled:true,currentAdmission:{ready:true,releaseId:'release-A'}},activePublication:{status:'READY'},pending:null};
  h.mounts[0].options.onState(state);await new Promise(setImmediate);
  assert.equal(h.api.modelCalls,before+1);assert.equal(h.api.requests.filter(p=>p==='layout').length,1);
  h.mounts[0].options.onState(state);await new Promise(setImmediate);
  assert.equal(h.api.requests.filter(p=>p==='layout').length,1);
  assert.ok(!h.api.requests.some(p=>p.includes('commands')));
  assert.match(h.elements.get('portalModelState').textContent,/release-A/);
});
test('production shell confirms deployment while its public map background GET is still pending',async()=>{
  const h=boot({actualAPI:true,hash:'#/maps'});await new Promise(setImmediate);
  assert.equal(h.api.deploymentConfirmed,true);
  assert.match(h.api.scope,/#deployment=real-deployment$/);
  assert.equal(h.api.legacyRecords.length,1);assert.equal(h.api.records.length,0);
  assert.ok(!h.elements.get('attentionList').innerHTML.includes('old-fixture'));
  assert.ok(!h.elements.get('attentionList').innerHTML.includes('不能更换部署范围'));
  assert.equal(h.api.requestCount,1);assert.equal(h.api.scopeBoundRequests,0);
  assert.ok(h.network.every(call=>call.options.method==='GET'));
  h.finishBackground();await new Promise(setImmediate);assert.equal(h.api.requestCount,0);
});


test('attention board is hidden when empty and remains visible for actual stale or disconnected state',async()=>{
 const h=boot();await new Promise(setImmediate);
 assert.equal(h.elements.get('attentionPanel').hidden,true);
 h.api.onState({upstreamOnline:false,upstreamAgeSeconds:99,robots:[{id:'R1',online:false,stale:true}],orders:[]});
 assert.equal(h.elements.get('attentionPanel').hidden,false);assert.match(h.elements.get('attentionList').innerHTML,/中断|过期|离线/);
 const markup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.ok(!markup.includes('普通网页暂停不是安全急停；请求受理不表示车辆已停稳或执行完成。'));
});


test('replay portal context stays historical through live ticks and restores real stale alerts on return',async()=>{
 const h=boot({simulation:true,scenario:true,hash:'#/simulation'});await new Promise(setImmediate);h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);
 h.api.onState({upstreamOnline:false,upstreamAgeSeconds:90,robots:[{id:'R1',online:false,stale:true}],orders:[]});assert.equal(h.elements.get('staleBanner').hidden,false);
 h.runMounts[0].options.onReplay({kind:'run',id:'old'});assert.equal(h.elements.get('staleBanner').hidden,true);
 assert.equal(h.elements.get('portalContext').hidden,true);assert.equal(h.elements.get('sidebarFleet').hidden,true);assert.equal(h.elements.get('sidebarModelTree').hidden,true);assert.equal(h.elements.get('viewTitle').textContent,'运行复盘');assert.equal(h.elements.get('replayContextNote').hidden,false);assert.equal(h.elements.get('attentionPanel').hidden,true);assert.match(h.elements.get('connectionPill').innerHTML,/非实时/);assert.equal(h.runMounts[0].view.readsPaused,true);assert.equal(h.scenarioMounts[0].view.readsPaused,true);
 h.api.onState({upstreamOnline:false,upstreamAgeSeconds:90,robots:[{id:'R1',online:false,stale:true}],orders:[]});assert.equal(h.elements.get('attentionPanel').hidden,true);assert.equal(h.elements.get('staleBanner').hidden,true);assert.match(h.elements.get('connectionPill').innerHTML,/历史记录视图/);
 h.replayMounts[0].view.close();assert.equal(h.elements.get('portalContext').hidden,false);assert.equal(h.elements.get('sidebarFleet').hidden,false);assert.equal(h.elements.get('sidebarModelTree').hidden,false);assert.equal(h.elements.get('viewTitle').textContent,'仿真工作台');assert.equal(h.elements.get('replayContextNote').hidden,true);assert.equal(h.elements.get('attentionPanel').hidden,false);assert.match(h.elements.get('connectionPill').innerHTML,/反馈不可用/);assert.equal(h.runMounts[0].view.readsPaused,false);assert.equal(h.elements.get('staleBanner').hidden,false);
});
test('scene background clears only on fresh explicit publication lifecycle change, not transient admission blockers',async()=>{
 const h=boot({publishing:true,simulation:true});await new Promise(setImmediate);
 vm.runInNewContext('background={source:"published-scene",releaseId:"scene-a"};document.getElementById("mapBackground").setAttribute("href","old-scene");',h.context);
 vm.runInNewContext('clearInactiveSceneBackground({currentAdmission:{ready:false},activePublication:{status:"READY",releaseId:"scene-a"}},true)',h.context);
 assert.equal(h.elements.get('mapBackground').href,'old-scene');
 vm.runInNewContext('clearInactiveSceneBackground({activePublication:{status:"RETIRED",releaseId:"scene-a"}},false)',h.context);
 assert.equal(h.elements.get('mapBackground').href,'old-scene');
 vm.runInNewContext('clearInactiveSceneBackground({activePublication:{status:"RETIRED",releaseId:"scene-a"}},true)',h.context);
 assert.equal(h.elements.get('mapBackground').href,undefined);assert.match(h.elements.get('backgroundCaption').textContent,/停止作为当前/);
 vm.runInNewContext('background={source:"bundled"};document.getElementById("mapBackground").setAttribute("href","bundle");clearInactiveSceneBackground({activePublication:{status:"UNKNOWN"}},true)',h.context);
 assert.equal(h.elements.get('mapBackground').href,'bundle');
});
test('portal origin uses only the currently admitted release profile and ignores other historical scene versions',async()=>{
 const h=boot();await new Promise(setImmediate);
 vm.runInNewContext('connectionCapabilities={environment:"SIM",targetId:"p0-pair",profileId:"empty-crossing-v1"};publicationStatus={currentAdmission:{ready:true,releaseId:"current-scene"},releases:[{releaseId:"old-scene",profileId:"wrong-historical-profile"},{releaseId:"current-scene",profileId:"scene-pair-v1"}]};renderPortal();',h.context);
 assert.match(h.elements.get('portalOriginState').textContent,/scene-pair-v1/);assert.doesNotMatch(h.elements.get('portalOriginState').textContent,/empty-crossing|wrong-historical/);
 vm.runInNewContext('publicationStatus.releases=[{releaseId:"old-scene",profileId:"scene-pair-v1"}];renderPortal();',h.context);
 assert.match(h.elements.get('portalOriginState').textContent,/empty-crossing-v1/);assert.doesNotMatch(h.elements.get('portalOriginState').textContent,/scene-pair-v1/);
 vm.runInNewContext('publicationStatus.currentAdmission.ready=false;publicationStatus.releases=[{releaseId:"current-scene",profileId:"scene-pair-v1"}];renderPortal();',h.context);
 assert.match(h.elements.get('portalOriginState').textContent,/empty-crossing-v1/);
});

test('server task and event workspaces mount after deployment identity and navigate using read-only callbacks',async()=>{const h=boot({history:true,hash:'#/missions'});await new Promise(setImmediate);assert.equal(h.historyMounts.length,0);h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);assert.equal(h.historyMounts.length,2);const [tasks,events]=h.historyMounts;assert.equal(tasks.view.visible,true);assert.equal(events.view.visible,false);h.context.location.hash='#/events';h.listeners.hashchange();assert.equal(tasks.view.visible,false);assert.equal(events.view.visible,true);events.options.onTask({q:'original-run'});assert.equal(tasks.view.filters.q,'original-run');h.api.onReceipts(h.snapshot);assert.equal(h.historyMounts.length,2);assert.ok(tasks.view.authChecks>0);});

test('real shell delegates update checks to original-request semantics and ignores polling counters',async()=>{
 const h=boot({publishing:true,simulation:true});await new Promise(setImmediate);h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);
 const map=h.mounts[0].view.controller,run=h.runMounts[0].view.controller;
 map.state.pending={requestId:'retired-history'};run.state.pending={runId:'closed-history'};
 map.updateBlocker=()=>'';run.updateBlocker=()=>'';
 h.api.scopeBoundRequests=4;h.api.receiptOperations=1;
 assert.equal(h.updateGuards.get('operations')(),'');
 map.updateBlocker=()=>'地图与发布 → 查询原发布请求';
 assert.match(h.updateGuards.get('operations')(),/查询原发布请求/);
 map.updateBlocker=()=>'';h.api.mutationRequests=1;assert.match(h.updateGuards.get('operations')(),/提交业务操作/);
});
test('visitor update ignores shared publication and receipt indexes while tab work still blocks',async()=>{
 const h=boot({publishing:true});await new Promise(setImmediate);h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);
 const map=h.mounts[0].view.controller,guard=h.updateGuards.get('operations');
 let own=false;
 h.api.portalSessionURL=()=>'https://fixture/api/v1/portal/session';
 h.api.hasSubmittedInTab=()=>own;
 h.api.records=[{status:'UNKNOWN'}];
 map.updateBlocker=({includeStored})=>includeStored?'查询原发布请求':'';
 assert.equal(guard(),'');
 assert.equal(h.updateReviewActions.get('operations')(),null);
 assert.equal(h.api.records.length,1);
 h.api.mutationRequests=1;assert.match(guard(),/提交业务操作/);
 h.api.mutationRequests=0;own=true;assert.match(guard(),/查询原发布请求/);
});
test('update review entry opens the relevant existing section and never bypasses an editor',async()=>{
 const h=boot({publishing:true,simulation:true});await new Promise(setImmediate);h.snapshot.deploymentConfirmed=true;h.api.onReceipts(h.snapshot);
 const map=h.mounts[0].view.controller,run=h.runMounts[0].view.controller;
 map.updateBlocker=()=>'原发布待核对';run.updateBlocker=()=>'';
 const section={open:false};h.elements.get('mapReleaseView').closest=()=>section;
 h.elements.get('mapReleaseView').scrollIntoView=()=>{assert.equal(h.elements.get('mapsWorkspace').hidden,false);assert.equal(h.elements.get('workspace').dataset.route,'maps');};
 let action=h.updateReviewActions.get('operations')();assert.equal(action.label,'前往核对原发布');
 assert.match(action.go(),/不会重发/);assert.equal(h.context.location.hash.replace(/^#/,''),'/maps');assert.equal(section.open,true);
 h.context.location.hash='#/operations';vm.runInNewContext('editorFrame={draft:{name:"未保存布局"}};',h.context);
 assert.match(action.go(),/原草稿已保留.*原有返回入口/);assert.equal(h.context.location.hash,'#/operations');
 assert.equal(vm.runInNewContext('editorFrame.draft.name',h.context),'未保存布局');
 vm.runInNewContext('editorFrame=null;',h.context);map.updateBlocker=()=>'';run.updateBlocker=()=>'原运行待核对';
 h.elements.get('singleTaskPanel').tagName='DETAILS';action=h.updateReviewActions.get('operations')();action.go();
 assert.equal(h.context.location.hash.replace(/^#/,''),'/simulation');assert.equal(h.elements.get('singleTaskPanel').open,true);
 assert.ok(!h.api.requests.some(p=>p.includes('commands')||p.includes('/controls')));
});
