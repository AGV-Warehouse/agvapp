const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Minimal DOM for the lifecycle panel. No browser or running service is contacted.
function harness({saved=new Map(),server=new Map(),lost=false}={}){
  const calls=[],revealed=[],observations=[];
  const content={markup:'',buttons:[],set innerHTML(value){
    this.markup=value;
    this.evidence={open:false};
    this.evidenceText={textContent:''};
    this.reviewButtons=[...value.matchAll(/<button[^>]*data-env-stop-review="([^"]+)"[^>]*>/g)].map(m=>({dataset:{envStopReview:m[1]},disabled:m[0].includes('disabled'),addEventListener(_event,fn){this.click=fn;}}));
    this.stopReview=this.reviewButtons.find(b=>['stopUnresolvedWorker','closeStoppedSession'].includes(b.dataset.envStopReview))||null;
    this.showButton=value.includes('data-env-show')?{addEventListener(_event,fn){this.click=fn;}}:null;
    this.buttons=[...value.matchAll(/<button[^>]*data-env-action="([^"]+)"[^>]*>/g)].map(m=>({
      dataset:{envAction:m[1]},disabled:m[0].includes('disabled'),
      addEventListener(_event,fn){this.click=fn;}
    }));
  },get innerHTML(){return this.markup;},querySelectorAll(selector){return selector==='[data-env-stop-review]'?this.reviewButtons:this.buttons;},querySelector(selector){return selector==='.sim-environment-evidence'?this.evidence:selector==='[data-env-evidence]'?this.evidenceText:selector==='[data-env-show]'?this.showButton:selector==='[data-env-stop-review]'?this.stopReview:null;}};
  const refresh={addEventListener(_event,fn){this.click=fn;}};
  const container={innerHTML:'',querySelector(selector){return selector==='[data-env-content]'?content:refresh;},replaceChildren(){}};
  const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
  const host={hidden:true,children:[],replaceChildren(...children){this.children=children;},querySelector(){return this.children[0]||null;},ownerDocument:{createElement(){const attrs={};return {setAttribute:(k,v)=>{attrs[k]=v;},getAttribute:k=>attrs[k]};}}};
  const context={URL,setInterval:()=>1,clearInterval:()=>{},sessionStorage:storage,module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/pages/simulation/environment-ui.js'),'utf8'),context);
  const api={scope:'fixed-origin:pair:deployment',keyRevision:1,key:'memory-key',authorized:true,deploymentConfirmed:true,deploymentId:'deployment',receiptSnapshot:()=>({canWrite:true}),id:()=>`audit-${calls.length}`,
    failReads:false,status:{enabled:true,deploymentId:'deployment',simulationReady:false,controlContext:{publicationId:'publication-one',activeRunIds:['run-one'],containers:[]},worker:{running:false},viewer:{running:false,rendererRunning:false,url:null},actions:{startWorker:{allowed:true},stopWorker:{allowed:false},startViewer:{allowed:false},stopViewer:{allowed:false}}},
    request:async(path,body)=>{
      calls.push({path,body});
      if(body){
        const value={...body,status:'COMPLETED'};
        server.set(body.requestId,value);
        if(lost)throw Error('lost response');
        return value;
      }
      if(path.startsWith('sim/environment/controls/')){
        const value=server.get(path.split('/').at(-1));
        if(!value)throw Error('not found');
        return value;
      }
      if(api.failReads)throw Error('environment unavailable');
      return JSON.parse(JSON.stringify(api.status));
    }};
  const mounted=context.module.exports.mount(container,api,{storage,viewerContainer:host,onViewerReveal(){revealed.push(host.children[0]);},onObservationChange(value){observations.push(value);}});
  return {mounted,calls,content,storage,saved,server,api,host,revealed,observations,viewerURL:context.module.exports.viewerURL};
}

test('viewer origin allowlist rejects credentials, alternate host, path and query',()=>{
  const h=harness();
  assert.equal(h.viewerURL('http://127.0.0.1:55236/'),'http://127.0.0.1:55236/');
  for(const value of ['http://127.0.0.1:55236/?token=x','http://127.0.0.1:55236/core/','http://localhost:55236/','http://user@127.0.0.1:55236/','http://127.0.0.1:55234/','javascript:alert(1)','https://example.com/'])assert.equal(h.viewerURL(value),null);
  h.mounted.destroy();
});

test('mount and repeated refresh create no lifecycle intent',async()=>{
  const h=harness();
  assert.equal(h.calls.length,0);
  await h.mounted.refresh();await h.mounted.refresh();
  assert.ok(h.calls.every(c=>!c.body));
  assert.equal(h.saved.size,0);
  h.mounted.destroy();
});

test('overview shares environment controls and only submits an explicitly opened or reviewed viewer action',async()=>{
  const h=harness();
  h.mounted.setVisible(false);
  h.api.status.actions.startViewer={allowed:true};
  h.api.status.actions.stopViewer={allowed:true};
  await h.mounted.setObservationVisible(true);
  assert.equal(h.observations.at(-1).canOpen,true);
  assert.equal(h.observations.at(-1).canReviewClose,true);
  assert.equal(h.host.hidden,true);
  assert.ok(h.calls.every(c=>!c.body));
  await h.mounted.openObservation();
  assert.deepEqual(h.calls.filter(c=>c.body).map(c=>c.body.action),['startViewer']);
  await h.mounted.closeObservation();
  h.mounted.reviewObservationClose();
  assert.equal(h.observations.at(-1).reviewOpen,true);
  assert.equal(h.calls.filter(c=>c.body).length,1);
  h.mounted.setObservationVisible(false);
  await h.mounted.closeObservation();
  await h.mounted.setObservationVisible(true);
  assert.equal(h.observations.at(-1).reviewOpen,false);
  h.mounted.reviewObservationClose();
  await h.mounted.closeObservation();
  const writes=h.calls.filter(c=>c.body);
  assert.deepEqual(writes.map(c=>c.body.action),['startViewer','stopViewer']);
  assert.equal(writes[1].body.expectedContext.publicationId,'publication-one');
  assert.equal(h.host.children.length,0);
  h.mounted.destroy();
});

test('unresolved SIM computation stop requires review and never sends on refresh',async()=>{
  const h=harness();h.api.status.worker.running=true;
  h.api.status.actions.stopUnresolvedWorker={allowed:true};
  await h.mounted.refresh();
  assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='stopUnresolvedWorker'));
  h.content.stopReview.click();
  assert.match(h.content.markup,/任务、资源占用和失败证据保留为未结案/);
  assert.ok(h.calls.every(c=>!c.body));
  await h.content.buttons.find(b=>b.dataset.envAction==='stopUnresolvedWorker').click();
  assert.equal(h.calls.filter(c=>c.body).length,1);
  assert.equal(h.calls.find(c=>c.body).body.action,'stopUnresolvedWorker');
  await h.mounted.refresh();assert.equal(h.calls.filter(c=>c.body).length,1);
  h.mounted.destroy();
});

test('force reset reviews the bound scene and two vehicles, then polls only the accepted receipt',async()=>{
  const h=harness();
  h.api.status.activePublicationStatus='UNKNOWN';
  h.api.status.scene={name:'双车验证场景'};
  h.api.status.activeRunIds=['run-one','run-two'];
  h.api.status.activeRunVehicles={'run-one':'LAB-01','run-two':'LAB-02'};
  h.api.status.actions.forceReset={allowed:true};
  h.api.status.controlContext.activeRunIds=['run-one','run-two'];
  const read=h.api.request;
  h.api.request=async(path,body)=>{
    if(!body)return read(path);
    h.calls.push({path,body});
    const pending={...body,status:'DISPATCHING',resetPhase:'RELEASING'};
    h.server.set(body.requestId,pending);
    return pending;
  };
  await h.mounted.refresh();
  assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='forceReset'));
  h.content.reviewButtons.find(b=>b.dataset.envStopReview==='forceReset').click();
  assert.match(h.content.markup,/双车验证场景.*未结案任务 2 项（LAB-01、LAB-02）/);
  assert.match(h.content.markup,/保留，原任务不会重放/);
  assert.ok(h.calls.every(c=>!c.body));
  await h.content.buttons.find(b=>b.dataset.envAction==='forceReset').click();
  const post=h.calls.find(c=>c.body);
  assert.equal(post.body.action,'forceReset');
  assert.deepEqual(JSON.parse(JSON.stringify(post.body.expectedContext)),h.api.status.controlContext);
  assert.match(h.content.markup,/正在结案未完成任务并核对车辆资源/);
  h.server.set(post.body.requestId,{...post.body,status:'COMPLETED'});
  h.api.status.activePublicationStatus='RETIRED';
  h.api.status.activeRunIds=[];
  h.api.status.actions.forceReset={allowed:false,reason:'SIM_RESET_NOT_NEEDED'};
  await h.mounted.refresh();
  assert.equal(h.calls.filter(c=>c.body).length,1);
  assert.match(h.content.markup,/仿真已复位，车辆资源已释放，旧发布已停用/);
  h.mounted.destroy();
});

test('lost POST response is recovered by original GET after page recreation',async()=>{
  const first=harness({lost:true});
  await first.mounted.refresh();
  await first.content.buttons.find(b=>b.dataset.envAction==='startWorker').click();
  const post=first.calls.find(c=>c.body);
  assert.ok(post);
  assert.equal(first.calls.filter(c=>c.body).length,1);
  assert.ok([...first.saved.values()].every(v=>!v.includes('memory-key')));
  // Recreate a pending index as if the browser closed after sending the request.
  first.storage.setItem('fleet-sim-environment:'+first.api.scope,JSON.stringify({pending:post.body,showViewer:false}));
  first.mounted.destroy();
  const second=harness({saved:first.saved,server:first.server});
  await second.mounted.refresh();
  assert.equal(second.calls[0].path,'sim/environment/controls/'+post.body.requestId);
  assert.ok(second.calls.every(c=>!c.body));
  second.mounted.destroy();
});

test('corrupt saved index and unauthorized refresh cannot submit control',async()=>{
  const saved=new Map([['fleet-sim-environment:fixed-origin:pair:deployment','not-json']]);
  const h=harness({saved});
  h.api.authorized=false;
  await h.mounted.refresh();
  assert.equal(h.calls.length,0);
  h.mounted.destroy();
});

test('observer stays available when navigation admission is lost but hides on failed environment GET',async()=>{
  const saved=new Map([['fleet-sim-environment:fixed-origin:pair:deployment',JSON.stringify({pending:null,showViewer:true})]]);
  const h=harness({saved});
  h.api.status.viewer={running:true,rendererRunning:true,ready:true,url:'http://127.0.0.1:55236/'};
  delete h.api.status.simulationReady;
  await h.mounted.refresh();
  assert.equal(h.host.hidden,false);
  assert.equal(h.host.children.length,1);
  const player=h.host.children[0];
  assert.match(player.getAttribute('allow'),/autoplay/);
  assert.equal(player.getAttribute('sandbox'),'allow-scripts allow-same-origin');
  h.api.status.simulationReady=true;
  await h.mounted.refresh();
  assert.equal(h.host.hidden,false);
  assert.equal(h.host.children[0],player);
  assert.deepEqual(h.revealed,[]);
  assert.equal(player.getAttribute('src'),'http://127.0.0.1:55236/');
  assert.doesNotMatch(h.content.markup,/>打开 Gazebo 实景</);
  h.api.failReads=true;
  await h.mounted.refresh();
  assert.equal(h.host.hidden,true);
  assert.equal(h.host.children.length,0);
  assert.ok(h.calls.every(c=>!c.body));
  h.mounted.destroy();
});

test('viewer startup shows first-frame wait and exposes late video without duplicating the request',async()=>{
  const h=harness();
  h.api.status.actions.startViewer={allowed:true};
  await h.mounted.refresh();
  const read=h.api.request;
  let finishStart;
  h.api.request=(path,body)=>body?new Promise(resolve=>{
    h.calls.push({path,body});
    finishStart=()=>resolve({...body,status:'FAILED'});
  }):read(path);
  const opening=h.content.buttons.find(b=>b.dataset.envAction==='startViewer').click();
  assert.match(h.content.markup,/正在启动视频，等待首帧/);
  h.api.status.actions.startViewer={allowed:false,reason:'VIEWER_ALREADY_RUNNING'};
  h.api.status.actions.stopViewer={allowed:true};
  h.api.status.viewer={running:true,rendererRunning:true,ready:false,url:null};
  finishStart();
  await opening;
  assert.equal(h.host.hidden,true);
  assert.match(h.content.markup,/暂未收到实时画面.*关闭 3D 画面后重新打开/);
  assert.equal(h.content.reviewButtons.find(b=>b.dataset.envStopReview==='stopViewer').disabled,false);
  Object.assign(h.api.status.viewer,{ready:true,url:'http://127.0.0.1:55236/'});
  await h.mounted.refresh();
  h.content.showButton.click();
  assert.equal(h.host.hidden,false);
  assert.equal(h.calls.filter(c=>c.body).length,1);
  h.mounted.destroy();
});

test('leaving the simulation disposes the video locally and returning verifies the source again',async()=>{
  const h=harness();
  h.api.status.viewer={running:true,rendererRunning:true,ready:true,url:'http://127.0.0.1:55236/'};
  await h.mounted.refresh();
  h.content.showButton.click();
  const player=h.host.children[0];
  assert.deepEqual(h.revealed,[player]);
  h.mounted.setVisible(false);
  assert.equal(h.host.hidden,true);
  assert.equal(h.host.children.length,0);
  await h.mounted.setVisible(true);
  assert.equal(h.host.hidden,false);
  assert.notEqual(h.host.children[0],player);
  assert.deepEqual(h.revealed,[player]);
  h.api.authorized=false;
  h.mounted.render();
  assert.equal(h.host.hidden,true);
  assert.equal(h.host.children.length,0);
  assert.ok(h.calls.every(c=>!c.body));
  h.mounted.destroy();
});

test('an explicit viewer start reveals its player only once after readiness',async()=>{
  const h=harness();
  h.api.status.actions.startViewer={allowed:true};
  await h.mounted.refresh();
  await h.content.buttons.find(b=>b.dataset.envAction==='startViewer').click();
  assert.deepEqual(h.revealed,[]);
  h.api.status.viewer={running:true,rendererRunning:true,ready:true,url:'http://127.0.0.1:55236/'};
  await h.mounted.refresh();
  const player=h.host.children[0];
  assert.ok(player);
  assert.deepEqual(h.revealed,[player]);
  h.api.failReads=true;
  await h.mounted.refresh();
  h.api.failReads=false;
  await h.mounted.refresh();
  assert.notEqual(h.host.children[0],player);
  assert.deepEqual(h.revealed,[player]);
  h.mounted.destroy();
});

test('second page opens an already running fresh viewer locally without a lifecycle POST',async()=>{
  const h=harness();
  h.api.status.simulationReady=true;
  h.api.status.viewer={running:true,rendererRunning:true,ready:true,url:'http://127.0.0.1:55236/'};
  h.api.status.actions.startViewer={allowed:false,reason:'VIEWER_ALREADY_RUNNING'};
  await h.mounted.refresh();
  assert.equal(h.host.hidden,true);
  assert.ok(h.content.showButton,'existing viewer gets a local show button');
  await h.content.showButton.click();
  assert.equal(h.host.hidden,false);
  assert.equal(h.host.children[0].getAttribute('src'),'http://127.0.0.1:55236/');
  assert.ok(h.calls.every(c=>!c.body));
  assert.equal(JSON.parse([...h.saved.values()][0]).pending,null);
  h.mounted.destroy();
});

test('replay hides the environment panel and pauses its live visibility before returning',async()=>{
  // Reuse only the existing offline shell harness; do not register its tests again.
  const source=fs.readFileSync(require.resolve('./app-shell.test.cjs'),'utf8');
  const prelude=source.slice(0,source.indexOf("\ntest('real shell"));
  const shared={require,__dirname,console,global,URL,URLSearchParams,queueMicrotask};
  vm.runInNewContext(prelude+'\nthis.shellBoot=boot;',shared);
  const h=shared.shellBoot({simulation:true,scenario:true,hash:'#/simulation'});
  await new Promise(setImmediate);
  const visibility=[];
  h.context.window.SimEnvironmentUI={mount(){return {setVisible(value){visibility.push(value);},authorizationChanged(){},destroy(){}};}};
  h.snapshot.deploymentConfirmed=true;
  h.api.onReceipts(h.snapshot);
  h.runMounts[0].options.onReplay({kind:'run',id:'recorded-run'});
  assert.equal(h.elements.get('simulationEnvironmentView').hidden,true);
  assert.equal(visibility.at(-1),false);
  assert.equal(h.elements.get('viewTitle').textContent,'运行复盘');
  h.replayMounts[0].view.close();
  assert.equal(h.elements.get('simulationEnvironmentView').hidden,false);
  assert.equal(visibility.at(-1),true);
  assert.equal(h.elements.get('viewTitle').textContent,'仿真工作台');
  assert.ok((h.api.requests||[]).every(path=>!path.includes('/controls')));
});


test('same-origin viewer permits only the dedicated path and rejects external or token URLs',()=>{
 const UI=require('../src/pages/simulation/environment-ui.js'),old=globalThis.location;
 try{globalThis.location={href:'https://192.168.0.109/#/simulation'};
 assert.equal(UI.viewerURL('/sim-viewer/'),'https://192.168.0.109/sim-viewer/');
 for(const url of ['https://evil.test/sim-viewer/','//evil.test/sim-viewer/','/sim-viewer/?key=secret','/sim-viewer/#x','/api/v1/commands','https://u:p@192.168.0.109/sim-viewer/'])assert.equal(UI.viewerURL(url),null);
 }finally{globalThis.location=old;}
});


test('unreadable old receipt does not block observing the current running viewer',async()=>{
  const pending={requestId:'missing-old',deploymentId:'deployment',action:'startViewer'};
  const saved=new Map([['fleet-sim-environment:fixed-origin:pair:deployment',JSON.stringify({pending,showViewer:false})]]);
  const h=harness({saved});
  h.api.status.simulationReady=true;
  h.api.status.viewer={running:true,rendererRunning:true,ready:true,url:'http://127.0.0.1:55236/'};
  await h.mounted.refresh();
  assert.ok(h.calls.some(c=>c.path==='sim/environment'));
  assert.ok(h.content.showButton);
  await h.content.showButton.click();
  assert.equal(h.host.hidden,false);
  assert.deepEqual(JSON.parse([...saved.values()][0]).pending,pending);
  assert.ok(h.calls.every(c=>!c.body));
  assert.ok(h.content.buttons.every(b=>b.disabled));
  h.mounted.destroy();
});


test('unavailable worker never claims stopped and expanded evidence survives polling',async()=>{
 const h=harness();h.api.status.worker={state:'unavailable',running:false,error:'ENVIRONMENT_HOST_UNAVAILABLE'};
 await h.mounted.refresh();assert.match(h.content.markup,/尚未确认停止/);assert.doesNotMatch(h.content.markup,/不占用仿真 CPU/);
 const button=h.content.buttons[0];
 h.content.evidence.open=true;h.api.status.observedAt='later';await h.mounted.refresh();assert.equal(h.content.evidence.open,true);
 assert.equal(h.content.buttons[0],button);
 assert.equal(JSON.parse(h.content.evidenceText.textContent).observedAt,'later');
 h.api.status.worker={state:'exited',running:false,error:null};await h.mounted.refresh();assert.match(h.content.markup,/已关闭，不占用仿真 CPU/);
 h.mounted.destroy();
});

test('preparation blocker explains the login workflow without requiring a shell',async()=>{
 const h=harness();h.api.status.worker={state:'unavailable',running:false,error:'ENVIRONMENT_HOST_UNAVAILABLE'};
 h.api.status.actions.startWorker={allowed:false,reason:'ENVIRONMENT_HOST_UNAVAILABLE'};
 await h.mounted.refresh();
 const steps=h.content.markup.split('<details')[0];assert.match(steps,/电脑已开机并登录/);assert.match(steps,/连接服务会自动准备/);assert.doesNotMatch(steps,/powershell|connect_server\.py|docker start/i);
 h.mounted.destroy();
});

test('normal shutdown is reviewed and submits the exact observed context once',async()=>{
 const h=harness();h.api.status.actions.stopWorker={allowed:true};
 await h.mounted.refresh();assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='stopWorker'));
 h.content.reviewButtons.find(b=>b.dataset.envStopReview==='stopWorker').click();
 assert.match(h.content.markup,/关闭当前隔离仿真服务与 3D 画面/);assert.ok(h.calls.every(c=>!c.body));
 await h.content.buttons.find(b=>b.dataset.envAction==='stopWorker').click();
 const posts=h.calls.filter(c=>c.body);assert.equal(posts.length,1);assert.deepEqual(JSON.parse(JSON.stringify(posts[0].body.expectedContext)),h.api.status.controlContext);
 await h.mounted.refresh();assert.equal(h.calls.filter(c=>c.body).length,1);h.mounted.destroy();
});

test('changed publication or run set withdraws environment confirmation and stale buttons cannot send',async()=>{
 const h=harness();h.api.status.actions.stopUnresolvedWorker={allowed:true};
 await h.mounted.refresh();h.content.stopReview.click();
 const staleConfirm=h.content.buttons.find(b=>b.dataset.envAction==='stopUnresolvedWorker');
 h.api.status.controlContext={...h.api.status.controlContext,publicationId:'publication-two',activeRunIds:['run-two']};
 await h.mounted.refresh();assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='stopUnresolvedWorker'));
 await staleConfirm.click();assert.ok(h.calls.every(c=>!c.body));h.mounted.destroy();
});

test('old stop review never changes into closure approval when polling changes available actions',async()=>{
 const h=harness();h.api.status.actions.stopUnresolvedWorker={allowed:true};
 await h.mounted.refresh();h.content.stopReview.click();
 h.api.status.actions.stopUnresolvedWorker={allowed:false};h.api.status.actions.closeStoppedSession={allowed:true};
 await h.mounted.refresh();assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='closeStoppedSession'));
 assert.ok(h.calls.every(c=>!c.body));h.mounted.destroy();
});

test('context rejection remains visible after the automatic status refresh',async()=>{
 const h=harness();h.api.status.actions.stopWorker={allowed:true};await h.mounted.refresh();
 h.content.reviewButtons.find(b=>b.dataset.envStopReview==='stopWorker').click();
 const base=h.api.request;h.api.request=async(path,body)=>{if(body)throw Object.assign(Error('changed'),{status:409,protocolFault:true,code:'ENVIRONMENT_CONTEXT_CHANGED'});return base(path,body);};
 await h.content.buttons.find(b=>b.dataset.envAction==='stopWorker').click();
 assert.match(h.content.markup,/本次操作未执行/);assert.ok(!h.content.buttons.some(b=>b.dataset.envAction==='stopWorker'));
 assert.equal(JSON.parse([...h.saved.values()][0]).pending,null);h.mounted.destroy();
});

test('an admitted-publication problem offers its direct review route without asking to publish again',async()=>{
 const h=harness();h.api.status.worker={running:true,state:'running'};h.api.status.activePublicationStatus='READY';h.api.status.scene={sceneId:'a'.repeat(32),name:'生产路线'};
 h.api.status.actions.stopWorker={allowed:false,reason:'PUBLICATION_RETIRE_REQUIRED'};
 await h.mounted.refresh();assert.match(h.content.markup,/当前场景尚未通过车辆准入/);assert.doesNotMatch(h.content.markup,/仿真服务已准备，等待场景发布/);
 assert.match(h.content.markup,/href="scene-builder\.html\?sceneId=a{32}&amp;step=simulation">查看并停用当前发布/);
 assert.ok(h.calls.every(c=>!c.body));h.mounted.destroy();
});

test('rejected publication without stopped evidence offers review rather than an impossible retirement',async()=>{
 const h=harness();h.api.status.worker={running:true,state:'running'};h.api.status.activePublicationStatus='REJECTED';
 h.api.status.actions.stopWorker={allowed:false,reason:'REJECTED_EXECUTION_UNCONFIRMED'};h.api.status.actions.stopUnresolvedWorker={allowed:true};
 await h.mounted.refresh();assert.match(h.content.markup,/发布未通过，尚未确认仿真执行已停止/);assert.match(h.content.markup,/停止仿真计算（保留未结案）/);assert.doesNotMatch(h.content.markup,/请先在场景发布页停用/);
 assert.ok(h.calls.every(c=>!c.body));h.mounted.destroy();
});

test('completed closure supplies the remaining empty-service retirement workflow for its original publication',async()=>{
 const h=harness();h.api.status.activePublicationId='publication-one';h.api.status.activePublicationStatus='UNKNOWN';
 h.api.status.latestControl={action:'closeStoppedSession',status:'COMPLETED',publicationId:'publication-one'};
 await h.mounted.refresh();assert.match(h.content.markup,/故障会话已结案，未成功到站。下一步：准备仿真服务.*不恢复原任务.*查看并停用当前发布.*关闭仿真服务/);
 h.api.status.activePublicationId='another-publication';await h.mounted.refresh();assert.doesNotMatch(h.content.markup,/故障会话已结案，未成功到站。下一步/);
 assert.ok(h.calls.every(c=>!c.body));h.mounted.destroy();
});
