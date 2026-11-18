const test=require('node:test');
const assert=require('node:assert/strict');
const {Controller,kernelEvidence,releaseAlreadyUsed,mount}=require('../map-release-ui.js');
function harness(handler=()=>({})) {
  const calls=[],store=new Map();
  const storage={getItem:k=>store.get(k)||null,setItem(k,v){store.set(k,v);}};
  const api={key:'test-key',authorized:true,id:()=> 'request-1',receiptSnapshot:()=>({scope:'https://fixture/api/v1/',canWrite:true}),async request(path,body){calls.push({path,body,stored:[...store.values()]});return handler(path,body);}};
  const controller=new Controller(api,{storage,lock:fn=>fn()});
  controller.state.status={enabled:true,targets:[{id:'p0-sim',environment:'SIM',isolation:true}],kernelHash:'kernel-before',activePublication:null};
  controller.state.statusFresh=true;
  controller.state.draft={id:'draft-1',revision:3,draft:{name:'saved map'}};
  controller.state.release={releaseId:'release-1',releaseHash:'release-hash',baselineKernelHash:'kernel-before'};
  return {controller,api,calls,store,storage};
}
const context={siteName:'Fab',sourceNotes:'measured 2026-11-08',coordinateEvidence:'map / m / measured origin',backgroundVersion:'b1',assumptions:[]};
test('configuration verification and full runtime observation stay distinct without inferred fallback',()=>{
  assert.deepEqual(kernelEvidence({configurationHash:'configuration-0ff9',hash:'observed-677d',verified:true,observedAt:'now'}),{configurationHash:'configuration-0ff9',fullObservationHash:'observed-677d',verified:true,observedAt:'now'});
  assert.deepEqual(kernelEvidence({hash:'legacy-observation',verified:true}),{configurationHash:null,fullObservationHash:'legacy-observation',verified:true,observedAt:null});
});
test('disabled or unproven target and blocking assumptions never initiate a write',async()=>{
  const h=harness();h.controller.state.status.enabled=false;
  await assert.rejects(()=>h.controller.importCurrent(),/尚未配置/);
  h.controller.state.status.enabled=true;h.controller.state.status.targets[0].environment='REAL';
  await assert.rejects(()=>h.controller.publish('p0-sim'),/隔离仿真目标/);
  h.controller.state.status.targets[0].environment='SIM';
  await assert.rejects(()=>h.controller.freeze({...context,assumptions:[{text:'width unknown',status:'unverified',owner:'PE',blocking:true}]}),/阻断性假设/);
  assert.equal(h.calls.length,0);
});
test('freeze submits saved revision and full context without changing running kernel',async()=>{
  const h=harness((path,body)=>{assert.equal(path,'sim-publishing/releases');return {releaseId:'new-release',releaseHash:'new-hash',context:body.context};});
  await h.controller.freeze(context);
  assert.deepEqual(h.calls[0].body,{draftId:'draft-1',revision:3,expectedKernelHash:'kernel-before',context});
  assert.equal(h.controller.state.status.kernelHash,'kernel-before');
  assert.equal(h.controller.state.release.releaseId,'new-release');
});
test('publication saves identity before POST and an uncertain response restores via GET only',async()=>{
  const first=harness(()=>{throw Error('response lost');});
  await assert.rejects(()=>first.controller.publish('p0-sim'),/response lost/);
  assert.ok(first.calls[0].stored[0].includes('request-1'));
  assert.equal(first.controller.state.publication.status,'UNKNOWN');
  const api={...first.api,request:async path=>{assert.ok(path.startsWith('sim-publishing/publications/'));return {requestId:'request-1',status:'UNKNOWN',stage:'WORKER_APPLYING',kernel:{hash:'kernel-new',verified:true},worker:{ready:false,blockers:['not loaded']}};}};
  const restored=new Controller(api,{storage:first.storage,lock:fn=>fn()});
  await restored.refreshPublication(restored.state.pending.requestId);
  assert.equal(restored.state.publication.kernel.hash,'kernel-new');
  assert.equal(restored.state.publication.status,'UNKNOWN');
  assert.equal(restored.state.pendingResolved,false);
  assert.equal(first.calls.length,1);
});
test('404 for a saved publication remains unresolved and cannot create a replacement',async()=>{
  const h=harness(()=>{throw Error('not found');});
  h.controller.savePending({scope:h.controller.scope,requestId:'old-id',releaseId:'old-release',targetId:'p0-sim',expectedKernelHash:'kernel-before'});
  await assert.rejects(()=>h.controller.publish('p0-sim'),/not found/);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].body,undefined);
  assert.equal(h.controller.state.pending.requestId,'old-id');
});
test('reviewing a rejected historical operation cannot unlock the live unknown publication',async()=>{
  const h=harness(()=>({requestId:'old-rejected',status:'REJECTED'}));
  h.controller.state.activePublication={requestId:'active',status:'UNKNOWN'};
  await h.controller.refreshPublication('old-rejected');
  assert.equal(h.controller.state.publication.status,'REJECTED');
  assert.equal(h.controller.state.activePublication.status,'UNKNOWN');
  await assert.rejects(()=>h.controller.publish('p0-sim'),/未结束发布/);
  assert.equal(h.calls.length,1);
});
test('changed target kernel, bad storage, and missing permission block before publication POST',async()=>{
  const h=harness();h.controller.state.status.kernelHash='changed';
  await assert.rejects(()=>h.controller.publish('p0-sim'),/内核已变化/);
  h.controller.state.status.kernelHash='kernel-before';h.storage.setItem=()=>{throw Error('quota');};
  await assert.rejects(()=>h.controller.publish('p0-sim'),/无法保存/);
  h.api.authorized=false;await assert.rejects(()=>h.controller.freeze(context),/登录/);
  assert.equal(h.calls.length,0);
});
test('verify only calls the explicit evidence recheck endpoint and never replays publication',async()=>{
  const h=harness(()=>({requestId:'existing',status:'READY',kernel:{verified:true},worker:{ready:true}}));
  h.controller.state.publication={requestId:'existing',status:'UNKNOWN'};
  h.controller.state.activePublication=h.controller.state.publication;
  await h.controller.verify();
  assert.deepEqual(h.calls.map(c=>c.path),['sim-publishing/publications/existing/verify']);
  assert.equal(h.controller.state.activePublication.status,'READY');
});
test('retire is explicit, bound to current READY and refreshes actual target state',async()=>{
  const h=harness(path=>path.endsWith('/retire')?{requestId:'existing',status:'RETIRED'}:{enabled:true,targets:[],kernelHash:'actual-after',activePublication:{requestId:'existing',status:'RETIRED'},currentAdmission:{ready:false}});
  h.controller.state.activePublication={requestId:'existing',status:'PUBLISHING'};
  await assert.rejects(()=>h.controller.retire(),/可申请停用/);
  assert.equal(h.calls.length,0);
  h.controller.state.activePublication.status='READY';
  await h.controller.retire();
  assert.deepEqual(h.calls.map(c=>c.path),['sim-publishing/publications/existing/retire','sim-publishing/status']);
  assert.equal(h.controller.state.status.kernelHash,'actual-after');
  assert.equal(h.controller.state.status.currentAdmission.ready,false);
});
test('retirement rejects a publication that replaced the reviewed identity before dispatch',async()=>{
 const h=harness();h.controller.state.activePublication={requestId:'replacement',status:'READY'};
 await assert.rejects(()=>h.controller.retire('reviewed-original'),/当前发布已变化/);
 assert.equal(h.calls.length,0);
});
test('a live READY version must be explicitly retired before a new publication',async()=>{
  const h=harness();h.controller.state.activePublication={requestId:'current',status:'READY'};
  await assert.rejects(()=>h.controller.publish('p0-sim'),/先审阅并停用/);
  assert.equal(h.calls.length,0);
});
test('submitted publication replaces the frozen-only notice without implying live readiness',async()=>{
  const h=harness((path,body)=>({requestId:body?.requestId || 'request-1',releaseId:'release-1',status:body?'PREFLIGHT':'READY'}));
  h.controller.state.notice='已冻结不可变版本。尚未发布，也未授予车辆运行资格。';
  await h.controller.publish('p0-sim');
  assert.ok(!h.controller.state.notice.includes('尚未发布'));assert.match(h.controller.state.notice,/尚未确认/);
  await h.controller.refreshPublication('request-1');assert.match(h.controller.state.notice,/实时准入/);
});
test('published and uncertain releases are single-use; only preflight REJECTED permits a new request',()=>{
  for(const status of ['PREFLIGHT','PUBLISHING','UNKNOWN','READY','RETIRED'])assert.equal(releaseAlreadyUsed({status:{publications:[{releaseId:'used',status}]}},'used'),true);
  assert.equal(releaseAlreadyUsed({status:{publications:[{releaseId:'used',status:'REJECTED'}]}},'used'),false);
  assert.equal(releaseAlreadyUsed({status:{publications:[{releaseId:'other',status:'READY'}]}},'new'),false);
});
test('a retired release cannot produce another publication request or overwrite its receipt',async()=>{
  const h=harness();h.controller.state.status.publications=[{requestId:'old-request',releaseId:'release-1',status:'RETIRED'}];
  await assert.rejects(()=>h.controller.publish('p0-sim'),/该执行版本已使用/);
  assert.equal(h.calls.length,0);assert.equal(h.store.size,0);
  assert.equal(h.controller.state.status.publications[0].requestId,'old-request');
});
test('render disables used release selection/publication but keeps history query and fresh versions available',t=>{
  const h=harness(),nodes=new Map();
  const container={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{}});return nodes.get(selector);},querySelectorAll(){return [];}};
  const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());container.replaceChildren=()=>{};
  const state=view.controller.state;state.statusFresh=true;state.status={enabled:true,targets:[{id:'p0-sim',environment:'SIM',isolation:true,label:'isolated'}],publications:[{requestId:'historical',releaseId:'used',status:'RETIRED'}],releases:[{releaseId:'used'},{releaseId:'fresh'}]};state.release={releaseId:'used'};
  view.render();nodes.get('[data-release-field="target"]').onchange({target:{value:'p0-sim'}});
  assert.match(container.innerHTML,/<option value="used"[^>]*disabled/);
  assert.match(container.innerHTML,/<button type="button" data-release-action="publish" disabled/);
  assert.match(container.innerHTML,/该执行版本已使用；重新冻结草稿生成新版本/);
  assert.match(container.innerHTML,/data-release-query="historical"/);
  state.release={releaseId:'fresh'};view.render();
  assert.match(container.innerHTML,/<button type="button" data-release-action="publish" >/);
});


test('confirmed authorization automatically restores current publication and saved pending through GET only',async t=>{
  const h=harness(path=>path==='sim-publishing/status'?{enabled:true,targets:[{id:'p0-pair',environment:'SIM',isolation:true}],activePublication:{requestId:'original-pair-publication',releaseId:'release-pair',status:'READY'},currentAdmission:{releaseId:'release-pair',ready:true}}:{requestId:'original-pair-publication',releaseId:'release-pair',status:'READY'});
  h.store.set('fleet-sim-publication.v1:https://fixture/api/v1/',JSON.stringify({scope:'https://fixture/api/v1/',requestId:'original-pair-publication',releaseId:'release-pair',targetId:'p0-pair',expectedKernelHash:'original-hash'}));
  h.api.receiptSnapshot=()=>({scope:'https://fixture/api/v1/',canWrite:true,deploymentConfirmed:true});
  const nodes=new Map(),container={innerHTML:'',replaceChildren(){},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{}});return nodes.get(selector);},querySelectorAll(){return [];}};
  const states=[],view=mount(container,h.api,{storage:h.storage,lock:fn=>fn(),onState:s=>states.push({ready:s.status?.currentAdmission?.ready,resolved:s.pendingResolved})});t.after(()=>view.destroy());
  await view.authorizationChanged();
  assert.deepEqual(h.calls.map(c=>c.path),['sim-publishing/status','sim-publishing/publications/original-pair-publication']);assert.ok(h.calls.every(c=>c.body===undefined));
  assert.equal(view.controller.state.pendingResolved,true);assert.equal(view.controller.state.status.currentAdmission.releaseId,'release-pair');assert.equal(states.at(-1).ready,true);
  await view.authorizationChanged();assert.equal(h.calls.length,2);
});


test('fresh worker with stale TF stays blocked and read-only diagnostics escape original evidence',t=>{
  const h=harness(),nodes=new Map();
  const container={innerHTML:'',replaceChildren(){},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{}});return nodes.get(selector);},querySelectorAll(){return [];}};
  const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());
  const a={ready:false,observedAt:'2026-11-08T12:00:00Z',sourceAgeSeconds:.04,blockers:['SIM_READINESS_EXPIRED'],worker:{ready:false,observedAt:'2026-11-08T12:00:00Z',robots:{'LAB-01':{ready:false,observedAt:'2026-11-08T12:00:00Z',blockers:['<script>stale TF</script>'],navigation:{ready:false,tf:{available:true,stamp:100,simAge:2.94},tfComponents:{'map->odom':{stamp:100,wallAge:.01,simAgeAtReceipt:2.93}}}}}}};
  view.controller.state.statusFresh=true;view.controller.state.status={currentAdmission:a};view.render();
  assert.match(container.innerHTML,/当前准入：未就绪 \/ 已阻断/);
  assert.match(container.innerHTML,/就绪源诊断/);assert.match(container.innerHTML,/2.94/);assert.match(container.innerHTML,/simAgeAtReceipt/);assert.match(container.innerHTML,/0.04/);
  assert.match(container.innerHTML,/&lt;script&gt;stale TF&lt;\/script&gt;/);assert.ok(!container.innerHTML.includes('<script>'));
  assert.match(container.innerHTML,/未提供/);assert.equal(h.calls.length,0);assert.equal(a.ready,false);
  view.controller.state.status={currentAdmission:{ready:true}};view.render();
  assert.match(container.innerHTML,/当前准入：后端允许/);assert.match(container.innerHTML,/未提供/);assert.equal(h.calls.length,0);
});


test('background reads visibly disable draft release target and revision selections until complete',async t=>{
  const h=harness(),nodes=new Map(),container={innerHTML:'',replaceChildren(){},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{}});return nodes.get(selector);},querySelectorAll(){return [];}};
  const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());
  view.controller.state.statusFresh=true;view.controller.state.status={enabled:true,targets:[{id:'p0-pair',environment:'SIM',isolation:true}],releases:[]};view.controller.state.draft={id:'draft',revision:1};
  let release;const pending=view.controller.run(()=>new Promise(resolve=>release=resolve));
  for(const field of ['draft','release','target','revision'])assert.match(container.innerHTML,new RegExp('data-release-field="'+field+'"[^>]*disabled'));
  release();await pending;
  for(const field of ['draft','release','target','revision'])assert.doesNotMatch(container.innerHTML,new RegExp('data-release-field="'+field+'"[^>]*disabled'));
  assert.equal(h.calls.length,0);
});


test('background publication read updates the same selected identity while preserving a different historical selection',async()=>{
  const h=harness(path=>path==='sim-publishing/status'?{enabled:true,targets:[],activePublication:{requestId:'current',status:'READY'}}:{requestId:'current',status:'READY'});
  h.controller.state.publication={requestId:'current',status:'PREFLIGHT'};
  h.controller.state.pending={requestId:'current'};
  await h.controller.refresh(true);
  assert.equal(h.controller.state.publication.status,'READY');
  h.controller.state.publication={requestId:'older-selected',status:'RETIRED'};
  await h.controller.refresh(true);
  assert.equal(h.controller.state.publication.requestId,'older-selected');
  assert.equal(h.controller.state.activePublication.requestId,'current');assert.equal(h.controller.state.activePublication.status,'READY');
  assert.ok(h.calls.every(c=>c.body===undefined));
});
test('freeze carries an explicitly selected preset only in that freeze and leaves old single requests unchanged',async()=>{
 const h=harness((path,body)=>({releaseId:'new-release',releaseHash:'hash',motionPreset:{id:body.motionPresetId}}));
 await h.controller.freeze(context,'development-v1');
 assert.equal(h.calls[0].body.motionPresetId,'development-v1');
 assert.equal(h.controller.state.release.motionPreset.id,'development-v1');
 await h.controller.freeze(context);
 assert.equal(Object.hasOwn(h.calls[1].body,'motionPresetId'),false);
 assert.equal(h.calls.length,2);
});

test('update guard retains resolved publication handles without blocking READY REJECTED or RETIRED history',async()=>{
 let status='RETIRED';const h=harness(()=>({requestId:'original',status}));
 h.controller.savePending({scope:h.controller.scope,requestId:'original',targetId:'p0-sim',releaseId:'r',expectedKernelHash:'k'});
 assert.match(h.controller.updateBlocker(),/地图与发布.*查询原发布请求/);
 assert.equal(h.controller.updateBlocker({includeStored:false}),'');
 assert.equal(h.controller.state.pending.requestId,'original');
 for(status of ['READY','REJECTED','RETIRED']){
  await h.controller.refreshPublication('original');assert.equal(h.controller.updateBlocker(),'');assert.equal(h.controller.state.pending.requestId,'original');
 }
 h.controller.state.publication={requestId:'different',status:'RETIRED'};h.controller.state.pendingResolved=false;
 assert.match(h.controller.updateBlocker(),/原发布/);
 status='UNKNOWN';await h.controller.refreshPublication('original');assert.match(h.controller.updateBlocker(),/原发布/);
});
test('map polling is read-only for updates while a business preflight still blocks',async()=>{
 const h=harness();let done;
 const read=h.controller.run(()=>new Promise(resolve=>done=resolve),'read');
 assert.equal(h.controller.updateBlocker(),'');done();await read;
 const write=h.controller.run(()=>new Promise(resolve=>done=resolve));
 assert.match(h.controller.updateBlocker({includeStored:false}),/正在处理/);done();await write;
 assert.equal(h.controller.updateBlocker(),'');
});
