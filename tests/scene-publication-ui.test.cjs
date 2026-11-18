const test=require('node:test'),assert=require('node:assert/strict');
require('../map-release-ui.js');
const UI=require('../src/pages/maps/scene-builder/publication-ui.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const sceneId='a'.repeat(32),releaseId='b'.repeat(32);
function harness(options={}){
  const previousStorage=global.localStorage,previousLocks=global.navigator?.locks;
  const values=new Map();global.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  Object.defineProperty(global.navigator,'locks',{configurable:true,value:{request:options.lock|| (async(name,fn)=>fn())}});
  const nodes=new Map(),calls=[],saved={id:sceneId,revision:4,dirty:false,pending:null,busy:false};
  let html='',replacements=0;const container={get innerHTML(){return html;},set innerHTML(value){html=value;replacements++;nodes.clear();},get replacements(){return replacements;},replaceChildren(){this.innerHTML='';},querySelector(selector){if(!this.innerHTML.includes(selector.slice(1,-1)))return null;if(!nodes.has(selector))nodes.set(selector,{addEventListener(type,fn){this[type]=fn;}});return nodes.get(selector);}};
  const release={releaseId,releaseHash:'hash',baselineKernelHash:'kernel',sceneSource:{sceneId,sceneRevision:4}};
  const api={scope:'scope-one',key:'test',authorized:true,deploymentConfirmed:true,id:()=> 'request-one',receiptSnapshot(){return {scope:this.scope,canWrite:true};},async request(path,body){calls.push({scope:this.scope,path,body});if(path==='sim-publishing/status'&&options.status)return options.status;if(path==='sim-publishing/status')return {enabled:true,targets:[{id:'p0-pair',environment:'SIM',isolation:true}],kernelHash:'kernel',publications:[]};if(path==='sim-publishing/releases/'+releaseId)return release;if(path==='sim-publishing/publications')return {requestId:body.requestId,releaseId:body.releaseId,status:'READY'};throw Error(path);}};
  const ui=UI.mount(container,api,{getSavedScene:()=>saved});
  return {ui,api,saved,calls,container,release,async click(name){const node=nodes.get('[data-scene-pub-'+name+']');assert.ok(node?.click,'missing '+name);node.click();await settle();await settle();},destroy(){ui.destroy();global.localStorage=previousStorage;Object.defineProperty(global.navigator,'locks',{configurable:true,value:previousLocks});}};
}
test('select and read-only refresh never dispatch publication or retirement',async()=>{const h=harness();try{await h.ui.select({releaseId});await h.ui.refresh();await h.click('publish');assert.ok(h.calls.every(call=>call.body===undefined));assert.match(h.container.innerHTML,/确认发布此场景/);}finally{h.destroy();}});
test('dirty scene after review blocks confirmation before formal publish',async()=>{const h=harness();try{await h.ui.select({releaseId});await h.click('publish');h.saved.dirty=true;await h.click('confirm-publish');assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);assert.match(h.container.innerHTML,/场景修订已变化/);}finally{h.destroy();}});
test('scope change cannot dispatch the release selected under the previous scope',async()=>{const h=harness();try{await h.ui.select({releaseId});await h.click('publish');h.api.scope='scope-two';await h.click('confirm-publish');assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);assert.doesNotMatch(h.container.innerHTML,/确认发布此场景/);}finally{h.destroy();}});
test('dirty edit while waiting for publication lock prevents the eventual POST',async()=>{let unlock;const h=harness({lock:(name,fn)=>new Promise((resolve,reject)=>{unlock=()=>Promise.resolve().then(fn).then(resolve,reject);})});try{await h.ui.select({releaseId});await h.click('publish');await h.click('confirm-publish');assert.equal(typeof unlock,'function');h.saved.dirty=true;unlock();await settle();await settle();assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);assert.match(h.container.innerHTML,/场景或连接已变化/);}finally{h.destroy();}});
test('late release A response cannot replace the newer selected release B',async()=>{const h=harness();let resolveA;const secondId='c'.repeat(32),base=h.api.request.bind(h.api);h.api.request=async(path,body)=>{if(path==='sim-publishing/releases/'+releaseId)return new Promise(resolve=>resolveA=resolve);if(path==='sim-publishing/releases/'+secondId)return {...h.release,releaseId:secondId};return base(path,body);};try{const first=h.ui.select({releaseId});await settle();await h.ui.select({releaseId:secondId});assert.match(h.container.innerHTML,new RegExp(secondId));resolveA(h.release);await first;assert.match(h.container.innerHTML,new RegExp(secondId));assert.doesNotMatch(h.container.innerHTML,new RegExp('"releaseId": "'+releaseId+'"'));assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);}finally{h.destroy();}});
test('same-scope key change hides late release responses and blocks a publish waiting on the lock',async()=>{let resolveRelease,unlock;const h=harness({lock:(name,fn)=>new Promise((resolve,reject)=>{unlock=()=>Promise.resolve().then(fn).then(resolve,reject);})});const base=h.api.request.bind(h.api);h.api.keyRevision=1;h.api.request=(path,body)=>path==='sim-publishing/releases/'+releaseId?new Promise(resolve=>resolveRelease=resolve):base(path,body);try{const pending=h.ui.select({releaseId});await settle();h.api.keyRevision=2;resolveRelease(h.release);await pending;assert.equal(h.container.innerHTML,'');assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);h.api.request=base;await h.ui.select({releaseId});assert.match(h.container.innerHTML,/审阅并发布/);await h.click('publish');await h.click('confirm-publish');h.api.keyRevision=3;unlock();await settle();await settle();assert.equal(h.calls.filter(call=>call.body!==undefined).length,0);assert.equal(h.container.innerHTML,'');}finally{h.destroy();}});
test('unchanged publication polling keeps the same buttons and focused control without replacing DOM',async()=>{const h=harness();try{await h.ui.select({releaseId});const before=h.container.replacements,button=h.container.querySelector('[data-scene-pub-publish]');button.focused=true;await h.ui.refresh();await h.ui.refresh();h.ui.render();assert.equal(h.container.replacements,before);assert.equal(h.container.querySelector('[data-scene-pub-publish]'),button);assert.equal(button.focused,true);h.api.keyRevision=2;h.ui.render();const empty=h.container.replacements;h.ui.render();assert.equal(h.container.replacements,empty);assert.equal(h.container.innerHTML,'');}finally{h.destroy();}});

test('historical READY cannot announce current readiness while admission is blocked',async()=>{const publication={requestId:'old-ready',releaseId,status:'READY'};const h=harness({status:{enabled:true,targets:[],publications:[publication],activePublication:publication,currentAdmission:{ready:false,releaseId}}});try{await h.ui.select({releaseId});assert.match(h.container.innerHTML,/发布已完成，当前车辆尚未就绪/);assert.doesNotMatch(h.container.innerHTML,/>仿真已就绪<|返回工作台看实景或下达任务/);assert.ok(h.calls.every(call=>call.body===undefined));}finally{h.destroy();}});
test('currently ready publication links to the workbench for viewing or dispatch',async()=>{
 const publication={requestId:'ready',releaseId,status:'READY'};
 const h=harness({status:{enabled:true,targets:[],publications:[publication],activePublication:publication,currentAdmission:{ready:true,releaseId}}});
 try{
  await h.ui.select({releaseId});
  assert.ok(h.container.innerHTML.includes('href="./?task=scene#/simulation">返回工作台看实景或下达任务</a>'));
  assert.ok(h.calls.every(call=>call.body===undefined));
 }finally{h.destroy();}
});
test('an active older publication can be reviewed from a draft with no selected release',async()=>{
 const publication={requestId:'old-ready',releaseId,status:'READY'};
 const h=harness({status:{enabled:true,targets:[],activePublication:publication}});
 try{
  await h.ui.refresh();await h.click('active-review');
  assert.match(h.container.innerHTML,/确认停用原发布/);
  assert.doesNotMatch(h.container.innerHTML,/审阅并发布/);
  assert.ok(h.calls.every(call=>call.body===undefined));
 }finally{h.destroy();}
});
test('polling a new active publication cancels the reviewed retirement rather than changing its target',async()=>{
 const original={requestId:'reviewed-original',releaseId,status:'READY'},status={enabled:true,targets:[],activePublication:original};
 const h=harness({status});
 try{
  await h.ui.select({releaseId});await h.click('retire');
  const staleConfirm=h.container.querySelector('[data-scene-pub-confirm-retire]');assert.ok(staleConfirm?.click);
  status.activePublication={requestId:'replacement',releaseId:'c'.repeat(32),status:'READY'};
  await h.ui.refresh();assert.doesNotMatch(h.container.innerHTML,/data-scene-pub-confirm-retire/);
  staleConfirm.click();await settle();assert.ok(h.calls.every(call=>call.body===undefined));
 }finally{h.destroy();}
});
test('a retired selected version explains the new-generation path and never republishes on refresh',async()=>{
 const publication={requestId:'retired-original',releaseId,status:'RETIRED'};
 const h=harness({status:{enabled:true,targets:[],activePublication:publication,publications:[publication]}});
 try{await h.ui.select({releaseId});await h.ui.refresh();assert.match(h.container.innerHTML,/此版本已经使用，不能再次启动/);assert.match(h.container.innerHTML,/新建生成方案/);assert.match(h.container.innerHTML,/data-scene-pub-publish disabled/);assert.ok(h.calls.every(call=>call.body===undefined));}finally{h.destroy();}
});
